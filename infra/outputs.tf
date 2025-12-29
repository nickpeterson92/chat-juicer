output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "database_endpoint" {
  description = "RDS Endpoint"
  value       = module.database.db_endpoint
}

output "database_port" {
  description = "RDS Port"
  value       = module.database.db_port
}

output "s3_bucket_name" {
  description = "S3 Bucket Name"
  value       = module.storage.bucket_name
}

output "s3_bucket_arn" {
  description = "S3 Bucket ARN"
  value       = module.storage.bucket_arn
}

output "app_public_ip" {
  description = "Public IP of the application server"
  value       = module.compute.public_ip
}

output "app_public_dns" {
  description = "Public DNS of the application server"
  value       = module.compute.public_dns
}

output "ssh_command" {
  description = "Command to SSH into the instance"
  value       = "ssh -i ${var.public_key_path} ec2-user@${module.compute.public_ip}"
}
