resource "aws_s3_bucket" "main" {
  bucket_prefix = "${var.project_name}-${var.environment}-files-"
  force_destroy = var.environment != "prod" # Protect prod data
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "main" {
  bucket = aws_s3_bucket.main.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["*"] # TODO: Restrict to specific domains in prod
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
