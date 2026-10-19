variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "pickapub"
}

variable "environment" {
  description = "dev or prod. Set in envs/<env>.tfvars."
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "alert_email" {
  description = "Where CloudWatch alarms are emailed. Kept out of git: set TF_VAR_alert_email."
  type        = string
  default     = ""
}

variable "region" {
  type    = string
  default = "eu-west-2"
}

variable "cognito_domain_prefix" {
  description = "Prefix for the Cognito hosted sign-in page. Must be unique across the whole AWS region."
  type        = string
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "deletion_protection" {
  description = "Set true once real reviews exist. Blocks terraform destroy on the database."
  type        = bool
  default     = false
}

variable "extra_callback_urls" {
  description = "Extra sign-in redirect URLs, e.g. a custom domain."
  type        = list(string)
  default     = []
}

variable "extra_origins" {
  description = "Extra browser origins allowed to call the API, e.g. https://pickapub.example."
  type        = list(string)
  default     = []
}

variable "domain_name" {
  description = "Custom domain for the site, e.g. pickapub.co.uk (prod) or dev.pickapub.co.uk. Empty = the cloudfront.net address."
  type        = string
  default     = ""
}

variable "hosted_zone_name" {
  description = "Route 53 hosted zone that holds domain_name. Empty = domain_name itself (right for prod; dev uses the prod zone)."
  type        = string
  default     = ""
}

variable "use_ses_email" {
  description = "Send sign-up and password emails through SES from no-reply@domain_name. Needs domain_name and SES production access."
  type        = bool
  default     = false
}
