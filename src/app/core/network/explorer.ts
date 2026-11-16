/** Explorer pages, or null on a network without an explorer (`NetworkConfig.explorerUrl`). */
export function explorerAddressUrl(explorer: string | null, address: string): string | null {
  return explorer && address ? `${explorer}/address/${encodeURIComponent(address)}` : null;
}

export function explorerOperationUrl(explorer: string | null, operation: string): string | null {
  return explorer && operation ? `${explorer}/op/${encodeURIComponent(operation)}` : null;
}
