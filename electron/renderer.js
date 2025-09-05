// Renderer process JavaScript
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const restartBtn = document.getElementById('restart-btn');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const typingIndicator = document.getElementById('typing-indicator');
const toolsContainer = document.getElementById('tools-container');
const toolsPanel = document.getElementById('tools-panel');
const toggleToolsBtn = document.getElementById('toggle-tools-btn');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const themeText = document.getElementById('theme-text');

let isConnected = true;  // Start as connected since bot auto-starts
let currentAssistantMessage = null;
let assistantMessageBuffer = '';
let hasShownWelcome = false;
let isInitialConnection = true;
let activeFunctionCalls = new Map(); // Track active function calls by call_id
let functionArgumentsBuffer = new Map(); // Buffer for streaming function arguments

// Function to add message to chat
function addMessage(content, type = 'assistant') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;
  
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);
  
  // Auto-scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  return contentDiv;
}

// Function to update current assistant message (for streaming)
function updateAssistantMessage(content) {
  if (!currentAssistantMessage) {
    currentAssistantMessage = addMessage('', 'assistant');
  }
  currentAssistantMessage.textContent = content;
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Function to create or update function call card
function createFunctionCallCard(callId, functionName, status = 'preparing') {
  console.log('Creating function card:', callId, functionName, status);
  
  // Handle case where callId might not be provided initially
  if (!callId) {
    callId = 'temp-' + Date.now();
  }
  let card = activeFunctionCalls.get(callId);
  
  if (!card) {
    // Create new card
    const cardDiv = document.createElement('div');
    cardDiv.className = 'function-call-card executing function-executing-pulse';
    cardDiv.id = `function-${callId}`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'function-header';
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'function-icon';
    iconDiv.innerHTML = '🔧';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'function-name';
    nameDiv.textContent = functionName;
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'function-status';
    statusDiv.textContent = status;
    
    headerDiv.appendChild(iconDiv);
    headerDiv.appendChild(nameDiv);
    headerDiv.appendChild(statusDiv);
    cardDiv.appendChild(headerDiv);
    
    toolsContainer.appendChild(cardDiv);
    toolsContainer.scrollTop = toolsContainer.scrollHeight;
    
    card = { element: cardDiv, name: functionName };
    activeFunctionCalls.set(callId, card);
  }
  
  return card;
}

// Function to update function call status
function updateFunctionCallStatus(callId, status, data = {}) {
  const card = activeFunctionCalls.get(callId);
  if (!card) return;
  
  const statusDiv = card.element.querySelector('.function-status');
  if (statusDiv) {
    statusDiv.textContent = status;
  }
  
  // Update card styling based on status
  if (status === 'executing') {
    card.element.className = 'function-call-card executing function-executing-pulse';
  } else if (status === 'completed') {
    card.element.className = 'function-call-card success';
    card.element.classList.remove('function-executing-pulse');
  } else if (status === 'error') {
    card.element.className = 'function-call-card error';
    card.element.classList.remove('function-executing-pulse');
  }
  
  // Add arguments if provided
  if (data.arguments && !card.element.querySelector('.function-arguments')) {
    const argsDiv = document.createElement('div');
    argsDiv.className = 'function-arguments';
    try {
      const parsedArgs = JSON.parse(data.arguments);
      argsDiv.textContent = JSON.stringify(parsedArgs, null, 2);
    } catch {
      argsDiv.textContent = data.arguments;
    }
    card.element.appendChild(argsDiv);
  }
  
  // Add result if provided
  if (data.result && !card.element.querySelector('.function-result')) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'function-result';
    resultDiv.textContent = data.result;
    card.element.appendChild(resultDiv);
  }
  
  // Add error if provided
  if (data.error && !card.element.querySelector('.function-result')) {
    const resultDiv = document.createElement('div');
    resultDiv.className = 'function-result';
    resultDiv.textContent = `Error: ${data.error}`;
    card.element.appendChild(resultDiv);
  }
}

// Function to handle streaming function arguments
function updateFunctionArguments(callId, delta, isDone = false) {
  const card = activeFunctionCalls.get(callId);
  if (!card) return;
  
  // Initialize buffer for this call if needed
  if (!functionArgumentsBuffer.has(callId)) {
    functionArgumentsBuffer.set(callId, '');
  }
  
  if (delta) {
    functionArgumentsBuffer.set(callId, functionArgumentsBuffer.get(callId) + delta);
  }
  
  let argsDiv = card.element.querySelector('.function-arguments');
  if (!argsDiv) {
    argsDiv = document.createElement('div');
    argsDiv.className = 'function-arguments streaming';
    card.element.appendChild(argsDiv);
  }
  
  if (isDone) {
    argsDiv.classList.remove('streaming');
    try {
      const parsedArgs = JSON.parse(functionArgumentsBuffer.get(callId));
      argsDiv.textContent = JSON.stringify(parsedArgs, null, 2);
    } catch {
      argsDiv.textContent = functionArgumentsBuffer.get(callId);
    }
    functionArgumentsBuffer.delete(callId);
  } else {
    // Show partial arguments while streaming
    argsDiv.textContent = functionArgumentsBuffer.get(callId) + '...';
  }
}

// Function to set connection status
function setConnectionStatus(connected) {
  isConnected = connected;
  
  if (connected) {
    statusIndicator.classList.remove('disconnected');
    statusText.textContent = 'Connected';
    userInput.disabled = false;
    sendBtn.disabled = false;
  } else {
    statusIndicator.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    userInput.disabled = true;
    sendBtn.disabled = true;
  }
}

// Send message function
function sendMessage() {
  const message = userInput.value.trim();
  
  if (!message || !isConnected) return;
  
  // Add user message to chat
  addMessage(message, 'user');
  
  // Clear input
  userInput.value = '';
  
  // Show typing indicator
  typingIndicator.parentElement.style.display = 'block';
  typingIndicator.classList.add('active');
  
  // Reset assistant message state
  currentAssistantMessage = null;
  assistantMessageBuffer = '';
  
  // Send to main process
  window.electronAPI.sendUserInput(message);
}

// Handle bot output (streaming response with JSON protocol)
window.electronAPI.onBotOutput((output) => {
  console.log('Raw output received:', output);
  // Parse the output to handle different scenarios
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Skip the initial connection message from Python bot (legacy format)
    if (isInitialConnection && (line.includes('Welcome to Chat Juicer!') || 
        line.includes('Connected to') || 
        line.includes('Using deployment:') || 
        line.includes('Type \'quit\'') || 
        line.includes('====') ||
        line.includes('Enter your message'))) {
      isInitialConnection = false;
      hasShownWelcome = true;
      continue;  // Skip all initial bot output
    }
    
    // Check for JSON messages
    const jsonMatch = line.match(/__JSON__(.+?)__JSON__/);
    if (jsonMatch) {
      try {
        const message = JSON.parse(jsonMatch[1]);
        
        switch(message.type) {
          case 'assistant_start':
            // Hide typing indicator and start new message
            typingIndicator.classList.remove('active');
            typingIndicator.parentElement.style.display = 'none';
            assistantMessageBuffer = '';
            currentAssistantMessage = addMessage('', 'assistant');
            break;
            
          case 'assistant_delta':
            // Add content to buffer exactly as received
            if (currentAssistantMessage) {
              assistantMessageBuffer += message.content;
              updateAssistantMessage(assistantMessageBuffer);
            }
            break;
            
          case 'assistant_end':
            // Message complete, reset for next message
            currentAssistantMessage = null;
            break;
            
          case 'function_detected':
            // Function call detected - show card immediately
            console.log('Function detected:', message);
            const card = createFunctionCallCard(message.call_id, message.name, 'preparing...');
            if (message.arguments) {
              updateFunctionCallStatus(message.call_id, 'ready', {
                arguments: message.arguments
              });
            }
            break;
            
          case 'function_executing':
            // Function is being executed
            console.log('Function executing:', message);
            updateFunctionCallStatus(message.call_id, 'executing...', {
              arguments: message.arguments
            });
            break;
            
          case 'function_completed':
            // Function execution complete
            console.log('Function completed:', message);
            if (message.success) {
              updateFunctionCallStatus(message.call_id, 'completed', {
                result: 'Success'
              });
            } else {
              updateFunctionCallStatus(message.call_id, 'error', {
                error: message.error
              });
            }
            // Clean up after a delay
            setTimeout(() => {
              activeFunctionCalls.delete(message.call_id);
            }, 30000); // Keep cards visible for 30 seconds
            break;
            
          case 'rate_limit_hit':
            // Show rate limit notification
            console.log('Rate limit hit:', message);
            addMessage(`⏳ Rate limit reached. Waiting ${message.wait_time}s before retry (attempt ${message.retry_count})...`, 'system');
            break;
            
          case 'rate_limit_failed':
            // Show rate limit failure
            console.error('Rate limit failed:', message);
            addMessage(`❌ ${message.message}. Please try again later.`, 'error');
            break;
            
          case 'function_call_added':
            // Legacy event - now handled by function_detected
            break;
            
          case 'function_call_arguments_delta':
            // Streaming function arguments
            if (message.item_id || message.call_id) {
              const callId = message.call_id || message.item_id;
              updateFunctionArguments(callId, message.delta, false);
            }
            break;
            
          case 'function_call_arguments_done':
            // Function arguments complete
            if (message.item_id || message.call_id) {
              const callId = message.call_id || message.item_id;
              updateFunctionArguments(callId, null, true);
            }
            break;
            
          case 'function_call_ready':
            // Function is ready to execute
            updateFunctionCallStatus(message.call_id, 'ready to execute');
            break;
            
          case 'function_executing':
            // Function is being executed
            updateFunctionCallStatus(message.call_id, 'executing...', {
              arguments: message.arguments
            });
            break;
            
          case 'function_executed':
            // Function execution complete
            if (message.success) {
              updateFunctionCallStatus(message.call_id, 'completed', {
                result: message.result_preview || 'Success'
              });
            } else {
              updateFunctionCallStatus(message.call_id, 'error', {
                error: message.error
              });
            }
            // Clean up after a delay
            setTimeout(() => {
              activeFunctionCalls.delete(message.call_id);
            }, 30000); // Keep cards visible for 30 seconds
            break;
        }
      } catch (e) {
        console.error('Failed to parse JSON message:', e);
      }
    } else if (line.startsWith('You:')) {
      // Skip echoed user input (legacy format)
      continue;
    } else if (line.includes('Enter your message') || line.includes('Type \'exit\'')) {
      // Skip input prompts (legacy format)
      continue;
    }
  }
  
  // Check for exit conditions
  if (output.includes('Goodbye!') || output.includes('An error occurred')) {
    setConnectionStatus(false);
    if (output.includes('Goodbye!')) {
      addMessage('Chat session ended. Click "Restart Bot" to start a new session.', 'system');
    }
  }
});

// Handle bot errors
window.electronAPI.onBotError((error) => {
  console.error('Bot error:', error);
  addMessage(`Error: ${error}`, 'error');
  setConnectionStatus(false);
});

// Handle bot disconnection
window.electronAPI.onBotDisconnected(() => {
  setConnectionStatus(false);
  addMessage('Bot disconnected. Click "Restart Bot" to reconnect.', 'system');
});

// Handle bot restart
window.electronAPI.onBotRestarted(() => {
  chatContainer.innerHTML = '';
  hasShownWelcome = false;
  currentAssistantMessage = null;
  assistantMessageBuffer = '';
  addMessage('Bot is restarting...', 'system');
});

// Event listeners
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

restartBtn.addEventListener('click', () => {
  window.electronAPI.restartBot();
});

// Toggle tools panel handler
if (toggleToolsBtn) {
  toggleToolsBtn.addEventListener('click', () => {
    toolsPanel.classList.toggle('collapsed');
    // Update arrow direction: ◀ when collapsed (to expand), ▶ when open (to collapse)
    toggleToolsBtn.textContent = toolsPanel.classList.contains('collapsed') ? '◀' : '▶';
    toggleToolsBtn.title = toolsPanel.classList.contains('collapsed') ? 'Show function calls' : 'Hide function calls';
  });
}

// Focus input on load and ensure it's enabled
window.addEventListener('load', () => {
  // Ensure input is enabled from the start
  userInput.disabled = false;
  sendBtn.disabled = false;
  userInput.focus();
  setConnectionStatus(true);  // Start as connected
  
  // Initialize dark mode from localStorage
  initializeTheme();
});

// Dark mode functionality
function initializeTheme() {
  // Check localStorage for saved theme preference
  const savedTheme = localStorage.getItem('theme') || 'light';
  
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeToggle(true);
  } else {
    document.documentElement.removeAttribute('data-theme');
    updateThemeToggle(false);
  }
}

function updateThemeToggle(isDark) {
  if (themeIcon && themeText) {
    if (isDark) {
      themeIcon.textContent = '☀️';
      themeText.textContent = 'Light';
    } else {
      themeIcon.textContent = '🌙';
      themeText.textContent = 'Dark';
    }
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  
  if (currentTheme === 'dark') {
    // Switch to light mode
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
    updateThemeToggle(false);
  } else {
    // Switch to dark mode
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    updateThemeToggle(true);
  }
}

// Add event listener for theme toggle button
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

