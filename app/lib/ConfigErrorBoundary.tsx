import { isRouteErrorResponse, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Route ErrorBoundary: shows an unreadable saved config as a banner, anything else goes to Shopify's boundary.
export function ConfigErrorBoundary() {
  const error = useRouteError();
  const message =
    isRouteErrorResponse(error) && typeof error.data?.configError === "string" ? error.data.configError : null;
  if (!message) return boundary.error(error);
  return (
    <s-page heading="Hookmatch">
      <s-banner tone="critical" heading="Hookmatch could not read your saved settings">
        <s-paragraph>{message}</s-paragraph>
        <s-paragraph>
          Your angles are untouched and your store keeps running as before. Reload the page, and if this stays, contact
          support so we can repair the saved settings.
        </s-paragraph>
      </s-banner>
    </s-page>
  );
}
