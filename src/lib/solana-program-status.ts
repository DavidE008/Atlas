type AccountInfoResponse = {
  error?: { message?: string };
  result?: { value?: { executable?: boolean } | null };
};

export async function isProgramExecutable(
  programId: string,
  rpcUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetcher(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [programId, { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  if (!response.ok) throw new Error("Devnet program status is unavailable.");
  const data = (await response.json()) as AccountInfoResponse;
  if (data.error) throw new Error(data.error.message ?? "Devnet program status is unavailable.");
  return data.result?.value?.executable === true;
}
