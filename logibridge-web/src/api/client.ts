/**
 * client.ts — Axios 实例
 */

import axios from "axios";

const client = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

export default client;
