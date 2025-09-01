// Renderer process JavaScript
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const restartBtn = document.getElementById('restart-btn');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const typingIndicator = document.getElementById('typing-indicator');

let isConnected = true;  // Start as connected since bot auto-starts
let currentAssistantMessage = null;
let assistantMessageBuffer = '';
let hasShownWelcome = false;
let isInitialConnection = true;

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

// Focus input on load and ensure it's enabled
window.addEventListener('load', () => {
  // Ensure input is enabled from the start
  userInput.disabled = false;
  sendBtn.disabled = false;
  userInput.focus();
  setConnectionStatus(true);  // Start as connected
});