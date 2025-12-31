variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "chat-juicer"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the database"
  type        = list(string)
  default     = ["71.231.5.129/32"]
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.xlarge"
}

variable "public_key_path" {
  description = "Path to public SSH key"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "github_token" {
  description = "GitHub PAT for cloning the repo"
  type        = string
  sensitive   = true
}

variable "tavily_api_key" {
  description = "API Key for Tavily search"
  type        = string
  sensitive   = true
  default     = ""
}

variable "azure_openai_api_key" {
  description = "Azure OpenAI API Key"
  type        = string
  sensitive   = true
}

variable "azure_openai_endpoint" {
  description = "Azure OpenAI Endpoint"
  type        = string
}

variable "sf_user" {
  description = "Salesforce Username"
  type        = string
  default     = ""
}

variable "sf_password" {
  description = "Salesforce Password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sf_token" {
  description = "Salesforce Security Token"
  type        = string
  sensitive   = true
  default     = ""
}

variable "registration_invite_code" {
  description = "Invite code required for user registration (leave empty to allow open registration)"
  type        = string
  sensitive   = true
  default     = ""
}
