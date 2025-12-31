variable "environment" {
  description = "Environment name (e.g., dev, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the instance will be deployed"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID where the instance will be deployed (must be public for direct SSH)"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.xlarge"
}

variable "public_key_path" {
  description = "Path to the public SSH key to be used for the instance"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket to grant access to"
  type        = string
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the instance (SSH & HTTP)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# --- Application Variables ---
variable "github_token" {
  description = "GitHub PAT for cloning the repo"
  type        = string
  sensitive   = true
}

variable "tavily_api_key" {
  description = "API Key for Tavily search (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "db_username" {
  description = "Database username"
  type        = string
}

variable "db_endpoint" {
  description = "Database endpoint (host:port)"
  type        = string
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}

variable "aws_region" {
  description = "AWS Region"
  type        = string
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

variable "jwt_secret" {
  description = "Secure random string for JWT signing"
  type        = string
  sensitive   = true
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
  description = "Invite code required for user registration"
  type        = string
  sensitive   = true
  default     = ""
}
