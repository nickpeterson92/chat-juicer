locals {
  common_tags = {
    Project     = "chat-juicer"
    Environment = var.environment
    nukeoptout  = "true" # Critical: Prevents automated cleanup
  }
}
