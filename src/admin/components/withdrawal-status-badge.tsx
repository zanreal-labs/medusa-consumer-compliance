import { StatusBadge } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import type { Withdrawal } from "../lib/api";

const COLORS: Record<Withdrawal["status"], "green" | "orange" | "red" | "grey" | "blue"> = {
  confirmed: "orange",
  expired: "grey",
  pending_confirmation: "grey",
  processed: "green",
  rejected: "red",
};

export const WithdrawalStatusBadge = ({ status }: { status: Withdrawal["status"] }) => {
  const { t } = useTranslation();
  return <StatusBadge color={COLORS[status]}>{t(`consumerCompliance.withdrawalStatuses.${status}`)}</StatusBadge>;
};
