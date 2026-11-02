/** Saves data as a file through the browser's download, under `name`. */
export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // The click has started the download; the URL can go once the browser has it.
  setTimeout(() => URL.revokeObjectURL(url));
}
