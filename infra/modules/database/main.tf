resource "aws_db_instance" "main" {
  identifier        = "${var.project_name}-${var.environment}-db"
  allocated_storage = 20
  storage_type      = "gp3"
  engine            = "postgres"
  engine_version    = "16.11"
  instance_class    = "db.t3.medium"
  db_name           = var.db_name
  username          = var.db_username
  password          = var.db_password

  # Networking
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = true # Required for Phase 2.5 local-to-cloud connection
  skip_final_snapshot    = true # Set false for prod

  performance_insights_enabled = true
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.project_name} DB Subnet Group"
  }
}

resource "aws_security_group" "db" {
  name_prefix = "${var.project_name}-${var.environment}-db-sg"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "PostgreSQL access"
  }

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.app_sg_id != null ? [var.app_sg_id] : []
    description     = "App Server access"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
