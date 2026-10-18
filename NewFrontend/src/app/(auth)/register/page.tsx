"use client";

import { RegisterForm } from "@/features/auth/RegisterForm";

/** Self-registration for farmers and buyers. Admins are created by the backend seed script only. */
export default function RegisterPage() {
  return <RegisterForm />;
}
