# --- IAM Role for EC2 ---
resource "aws_iam_role" "ec2_role" {
  name = "${var.project_name}-${var.environment}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Policy to allow S3 Access
resource "aws_iam_role_policy" "s3_access" {
  name = "${var.project_name}-${var.environment}-s3-access"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = var.s3_bucket_arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListMultipartUploadParts",
          "s3:AbortMultipartUpload"
        ]
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "${var.project_name}-${var.environment}-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# --- Security Group ---
resource "aws_security_group" "app_sg" {
  name_prefix = "${var.project_name}-${var.environment}-app-sg"
  vpc_id      = var.vpc_id
  description = "Security group for application server"

  # SSH Access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "SSH access"
  }

  # HTTP API Access
  ingress {
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "API access (whitelisted)"
  }

  # HTTPS Access (Cloudflare proxy IPs only)
  # Source: https://www.cloudflare.com/ips-v4/
  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidr_blocks = [
      "173.245.48.0/20",
      "103.21.244.0/22",
      "103.22.200.0/22",
      "103.31.4.0/22",
      "141.101.64.0/18",
      "108.162.192.0/18",
      "190.93.240.0/20",
      "188.114.96.0/20",
      "197.234.240.0/22",
      "198.41.128.0/17",
      "162.158.0.0/15",
      "104.16.0.0/13",
      "104.24.0.0/14",
      "172.64.0.0/13",
      "131.0.72.0/22",
    ]
    description = "HTTPS from Cloudflare only"
  }

  # HTTP API Access (Cloudflare proxy - for Flexible SSL mode)
  # When Cloudflare SSL is set to "Flexible", it terminates HTTPS and connects to origin via HTTP
  ingress {
    from_port = 8000
    to_port   = 8000
    protocol  = "tcp"
    cidr_blocks = [
      "173.245.48.0/20",
      "103.21.244.0/22",
      "103.22.200.0/22",
      "103.31.4.0/22",
      "141.101.64.0/18",
      "108.162.192.0/18",
      "190.93.240.0/20",
      "188.114.96.0/20",
      "197.234.240.0/22",
      "198.41.128.0/17",
      "162.158.0.0/15",
      "104.16.0.0/13",
      "104.24.0.0/14",
      "172.64.0.0/13",
      "131.0.72.0/22",
    ]
    description = "HTTP API from Cloudflare (Flexible SSL)"
  }

  # Egress (Allow all outbound)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-app-sg"
    # Mandatory for Innovation Lab
    nukeoptout = "true"
  }
}

# --- Key Pair ---
resource "aws_key_pair" "deployer" {
  key_name   = "${var.project_name}-${var.environment}-key"
  public_key = file(var.public_key_path)
}

# --- EC2 Instance ---
# Get latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "app_server" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  subnet_id     = var.subnet_id

  vpc_security_group_ids = [aws_security_group.app_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  key_name               = aws_key_pair.deployer.key_name

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    github_token          = var.github_token
    tavily_api_key        = var.tavily_api_key
    db_password           = var.db_password
    db_username           = var.db_username
    db_endpoint           = var.db_endpoint
    s3_bucket             = var.s3_bucket_name
    aws_region            = var.aws_region
    azure_openai_api_key  = var.azure_openai_api_key
    azure_openai_endpoint = var.azure_openai_endpoint
    jwt_secret            = var.jwt_secret
    sf_user               = var.sf_user
    sf_password           = var.sf_password
    sf_token              = var.sf_token
  })
  user_data_replace_on_change = true

  # Root block device
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    tags = {
      nukeoptout = "true"
    }
  }

  tags = {
    Name       = "${var.project_name}-${var.environment}-app"
    nukeoptout = "true"
  }

  # Prevent replacement when user_data changes (e.g., JWT secret regenerates)
  # To force replacement, use: terraform apply -replace="module.compute.aws_instance.app_server"
  lifecycle {
    ignore_changes = [user_data]
  }
}

# --- Elastic IP for stable public address ---
resource "aws_eip" "app_eip" {
  domain = "vpc"

  tags = {
    Name       = "${var.project_name}-${var.environment}-eip"
    nukeoptout = "true"
  }
}

resource "aws_eip_association" "app_eip_assoc" {
  instance_id   = aws_instance.app_server.id
  allocation_id = aws_eip.app_eip.id
}
