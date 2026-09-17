import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serwer produkcyjny pakowany do samodzielnego bundla (.next/standalone) --
  // wymagane przez frontend/Dockerfile, żeby obraz nie wiózł node_modules.
  output: "standalone",

  // Plakietka dev Next.js siada w lewym dolnym rogu -- dokładnie na zakładce
  // „Pulpit" w dolnej nawigacji. Przechwytuje kliknięcia i psuje zarówno
  // ręczne klikanie na telefonie, jak i testy E2E. W buildzie produkcyjnym jej
  // nie ma, więc wyłączenie niczego nie kosztuje.
  devIndicators: false,
};

export default nextConfig;
