import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useMemo, useEffect } from "preact/hooks";

// Must match the namespace/keys read by the function's input query
// (free-shipping-threshold-function/src/cart_delivery_options_discounts_generate_run.graphql)
// and the [[extensions.metafields]] entries in shopify.extension.toml.
const METAFIELD_NAMESPACE = "$app";
const MINIMUM_KEY = "minimum_subtotal";
const PERCENTAGE_KEY = "shipping_discount_percentage";

const DEFAULT_PERCENTAGE = 100;

export default async () => {
  render(<App />, document.body);
};

function App() {
  const { applyMetafieldChange, i18n, data, discounts } = shopify;

  const saved = useMemo(() => {
    const find = (key) =>
      data?.metafields?.find((metafield) => metafield.key === key)?.value;

    const minimum = Number(find(MINIMUM_KEY));
    const rawPercentage = find(PERCENTAGE_KEY);
    const percentage = Number(rawPercentage);

    return {
      minimum: Number.isFinite(minimum) && minimum > 0 ? minimum : 0,
      percentage:
        rawPercentage != null && Number.isFinite(percentage)
          ? percentage
          : DEFAULT_PERCENTAGE,
    };
  }, [data?.metafields]);

  const [minimum, setMinimum] = useState(saved.minimum);
  const [percentage, setPercentage] = useState(saved.percentage);
  const [error, setError] = useState();

  // The function only acts on the SHIPPING class. Product/order classes would
  // do nothing, so keep the discount set to shipping only.
  const discountClasses = discounts?.discountClasses?.value ?? [];
  useEffect(() => {
    if (
      discounts?.updateDiscountClasses &&
      (discountClasses.length !== 1 || discountClasses[0] !== "shipping")
    ) {
      discounts.updateDiscountClasses(["shipping"]).then((result) => {
        if (!result?.success) setError(i18n.translate("error"));
      });
    }
  }, [discountClasses.join(",")]);

  const minimumError =
    minimum > 0 ? undefined : i18n.translate("minimumSubtotal.error");
  const percentageError =
    percentage >= 1 && percentage <= 100
      ? undefined
      : i18n.translate("shippingPercentage.error");

  async function save() {
    if (minimumError || percentageError) {
      throw new Error(minimumError || percentageError);
    }

    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: METAFIELD_NAMESPACE,
      key: MINIMUM_KEY,
      value: minimum.toFixed(2),
      valueType: "number_decimal",
    });
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: METAFIELD_NAMESPACE,
      key: PERCENTAGE_KEY,
      value: String(percentage),
      valueType: "number_decimal",
    });
  }

  function reset() {
    setMinimum(saved.minimum);
    setPercentage(saved.percentage);
  }

  return (
    <s-function-settings
      onSubmit={(event) => {
        event.waitUntil?.(save());
      }}
      onReset={reset}
    >
      <s-heading>{i18n.translate("title")}</s-heading>
      <s-section>
        <s-stack gap="base">
          {error ? <s-banner tone="critical">{error}</s-banner> : null}

          <s-number-field
            label={i18n.translate("minimumSubtotal.label")}
            name={MINIMUM_KEY}
            value={String(minimum)}
            defaultValue={String(saved.minimum)}
            min={0}
            step={0.01}
            prefix="$"
            details={i18n.translate("minimumSubtotal.help")}
            error={minimumError}
            onChange={(event) => setMinimum(Number(event.currentTarget.value))}
          />

          <s-number-field
            label={i18n.translate("shippingPercentage.label")}
            name={PERCENTAGE_KEY}
            value={String(percentage)}
            defaultValue={String(saved.percentage)}
            min={1}
            max={100}
            step={1}
            suffix="%"
            details={i18n.translate("shippingPercentage.help")}
            error={percentageError}
            onChange={(event) =>
              setPercentage(Number(event.currentTarget.value))
            }
          />
        </s-stack>
      </s-section>
    </s-function-settings>
  );
}
