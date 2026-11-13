import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export function useCopy(text: string) {
  const shopify = useAppBridge();
  return async () => {
    try {
      await navigator.clipboard.writeText(text);
      shopify.toast.show("Copied");
    } catch {
      shopify.toast.show("Could not copy. Select the text and copy it.", { isError: true });
    }
  };
}

// Toasts the first error when a fetcher's save fails.
export function useErrorToast(data: { ok: boolean; errors: string[] } | undefined) {
  const shopify = useAppBridge();
  useEffect(() => {
    if (data?.ok === false) shopify.toast.show(data.errors[0] ?? "Could not save", { isError: true });
  }, [data, shopify]);
}

export function SaveErrors({ errors }: { errors: string[] }) {
  return (
    <s-banner tone="critical" heading="Not saved">
      <s-unordered-list>
        {errors.map((e) => (
          <s-list-item key={e}>{e}</s-list-item>
        ))}
      </s-unordered-list>
    </s-banner>
  );
}
