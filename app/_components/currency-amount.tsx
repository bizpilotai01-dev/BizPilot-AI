const formatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

type CurrencyAmountProps = {
  amount: number;
};

export function CurrencyAmount({ amount }: CurrencyAmountProps) {
  const parts = formatter.formatToParts(amount);
  const symbol = parts.filter((part) => part.type === "currency").map((part) => part.value).join("");
  const value = parts.filter((part) => part.type !== "currency").map((part) => part.value).join("").trim();

  return (
    <span className="currency-amount">
      <span>{symbol}</span>
      <span>{value}</span>
    </span>
  );
}
