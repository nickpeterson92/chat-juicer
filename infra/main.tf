terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend state storage would go here (s3 backend recommended for team usage)
  backend "s3" {
    bucket         = "chat-juicer-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "chat-juicer-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# Networking Module
module "networking" {
  source = "./modules/networking"

  environment  = var.environment
  project_name = var.project_name
  vpc_cidr     = "10.0.0.0/16"
}

# Storage Module (S3)
module "storage" {
  source = "./modules/storage"

  environment  = var.environment
  project_name = var.project_name
}

# Database Module (RDS)
module "database" {
  source = "./modules/database"

  environment  = var.environment
  project_name = var.project_name
  vpc_id       = module.networking.vpc_id
  subnet_ids   = module.networking.public_subnet_ids

  # Database settings
  db_name     = "chatjuicer"
  db_username = "chatjuicer"
  # db_password sent via env var or secrets manager recommended
  db_password         = var.db_password
  allowed_cidr_blocks = var.allowed_cidr_blocks
  app_sg_id           = module.compute.security_group_id
}

module "compute" {
  source = "./modules/compute"

  environment  = var.environment
  project_name = var.project_name
  vpc_id       = module.networking.vpc_id
  # Use first public subnet for the instance
  subnet_id = module.networking.public_subnet_ids[0]

  instance_type       = var.instance_type
  public_key_path     = var.public_key_path
  s3_bucket_arn       = module.storage.bucket_arn
  allowed_cidr_blocks = var.allowed_cidr_blocks

  # App Config
  github_token   = var.github_token
  tavily_api_key = var.tavily_api_key

  # DB Config
  db_password = var.db_password
  db_username = "chatjuicer"
  db_endpoint = module.database.db_endpoint

  # Storage Config
  s3_bucket_name = module.storage.bucket_name
  aws_region     = var.aws_region

  # Azure OpenAI Config
  azure_openai_api_key  = var.azure_openai_api_key
  azure_openai_endpoint = var.azure_openai_endpoint

  # Auth & Integrations
  jwt_secret  = random_password.jwt_secret.result
  sf_user     = var.sf_user
  sf_password = var.sf_password
  sf_token    = var.sf_token
}

# Generate a strong JWT secret automatically
resource "random_password" "jwt_secret" {
  length  = 32
  special = true
}
