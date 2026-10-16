variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "pickapub"
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
