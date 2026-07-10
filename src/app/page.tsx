import { HomeClient } from "./home-client";

// Force dynamic so the env var is read at runtime, not build time
export const dynamic = "force-dynamic";

const DEFAULT_SERVER_URL = process.env.DEFAULT_SERVER_URL || "http://localhost:8080";

export default function Home() {
  return <HomeClient defaultServerUrl={DEFAULT_SERVER_URL} />;
}
