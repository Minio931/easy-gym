import { apiFetch } from "@/lib/api/client";
import type {
  LoginRequest,
  LogoutRequest,
  MeResponse,
  TokenPairResponse,
} from "@/types/api";

export function login(credentials: LoginRequest): Promise<TokenPairResponse> {
  return apiFetch<TokenPairResponse>("/api/auth/login", {
    method: "POST",
    body: credentials,
    authenticated: false,
  });
}

export function logout(body: LogoutRequest): Promise<void> {
  return apiFetch<void>("/api/auth/logout", {
    method: "POST",
    body,
    authenticated: false,
  });
}

export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/me");
}
