type SalaryInput = {
  salary_min?: string | number | null;
  salary_max?: string | number | null;
  salary_currency?: string | null;
};

const parseSalaryNumber = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatSalaryValue = (value: number, currency: string) => {
  const rounded = Math.round(value);
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(rounded);
  return `${currency} ${formatted}`;
};

export const formatSalaryDisplay = (input?: SalaryInput | null) => {
  if (!input) return null;
  const min = parseSalaryNumber(input.salary_min);
  const max = parseSalaryNumber(input.salary_max);
  if (min === null && max === null) return null;
  const currency = input.salary_currency || "PHP";
  if (min !== null && max !== null) {
    return {
      label: "Salary range",
      value: `${formatSalaryValue(min, currency)} – ${formatSalaryValue(max, currency)}`,
    };
  }
  if (min !== null) {
    return {
      label: "Salary",
      value: formatSalaryValue(min, currency),
    };
  }
  return {
    label: "Salary",
    value: formatSalaryValue(max as number, currency),
  };
};
