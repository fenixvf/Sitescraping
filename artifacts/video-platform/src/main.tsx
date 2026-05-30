import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const apiKey = import.meta.env.VITE_API_KEY as string | undefined;
if (apiKey) {
  setAuthTokenGetter(() => apiKey);
}

createRoot(document.getElementById("root")!).render(<App />);
