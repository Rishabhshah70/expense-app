"use client";

import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  User,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SplitType = "equal" | "tejal" | "rishabh" | "custom";
type Tab = "add" | "monthly" | "list";
type EntryType = "expense" | "loan" | "cash";

type FirestoreTimestampLike = {
  seconds: number;
};

type Expense = {
  id: string;
  entryType?: EntryType;
  amount: number;
  category: string;
  paidBy: string;
  date: string | FirestoreTimestampLike;
  description?: string;
  rishabhShare: number;
  tejalShare: number;
  borrower?: string;
};

type ExpensePayload = Omit<Expense, "id">;

const EXPENSE_CATEGORIES = [
  "Cash Expense",
  "Cash",
  "Rent",
  "Utilities",
  "Groceries",
  "Shopping",
  "Medical Expenses",
  "Dining",
  "Home supplies",
  "Transit",
  "Other",
] as const;

const CHART_COLORS = [
  "#0f766e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#14b8a6",
  "#84cc16",
  "#ec4899",
  "#6b7280",
];

// Negative means Rishabh owes Tejal before Jan 2026.
const OPENING_BALANCE_BEFORE_2026 = -61790;
const DEFAULT_INITIAL_CASH_POOL_BALANCE = 15000;
const SETTINGS_DOC_ID = "appConfig";
const AUTH_ATTEMPT_KEY = "expense-app-auth-attempt";
const ALLOWED_EMAILS = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const containerStyle = {
  padding: "clamp(16px, 4vw, 24px)",
  maxWidth: 1400,
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "system-ui, sans-serif",
  color: "#111827",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  minHeight: 52,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 16,
  color: "#111827",
  background: "#fff",
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
};

const labelStyle = {
  fontWeight: 600,
  fontSize: 14,
};

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const authCardStyle = {
  ...cardStyle,
  maxWidth: 520,
  margin: "48px auto",
  padding: 24,
};

const tableHeaderStyle = {
  borderBottom: "1px solid #e5e7eb",
  padding: "14px 16px",
  textAlign: "left" as const,
  fontWeight: 700,
  fontSize: 13,
  color: "#374151",
  background: "#f9fafb",
};

const tableCellStyle = {
  borderBottom: "1px solid #f3f4f6",
  padding: "14px 16px",
  textAlign: "left" as const,
  verticalAlign: "top" as const,
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

function parseExpenseDate(value: Expense["date"]) {
  if (typeof value === "string") {
    return new Date(`${value}T00:00:00`);
  }

  if (value && typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }

  return new Date("");
}

function formatDate(value: Expense["date"]) {
  const parsed = parseExpenseDate(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDateInputValue(value: Expense["date"]) {
  const parsed = parseExpenseDate(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().split("T")[0];
}

function formatCurrency(value: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTooltipValue(value: unknown) {
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  return formatCurrency(Number(normalizedValue ?? 0));
}

function formatPercentage(value: number) {
  return `${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatCompactCurrency(value: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)}`;
}

function isAllowedEmail(email: string | null | undefined) {
  return !!email && ALLOWED_EMAILS.includes(email.toLowerCase());
}

function isSameMonth(date: Date, reference: Date) {
  return (
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

function buildCategoryData(expenses: Expense[]) {
  return EXPENSE_CATEGORIES.map((categoryName) => {
    const totalAmount = expenses
      .filter((exp) => {
        const normalizedCategory =
          (exp.entryType ?? "expense") === "cash" ? "Cash" : exp.category;
        return normalizedCategory === categoryName;
      })
      .reduce((sum, exp) => sum + exp.amount, 0);

    return {
      name: categoryName,
      value: Number(totalAmount.toFixed(2)),
    };
  }).filter((item) => item.value > 0);
}

function buildMonthlyExpenseData(expenses: Expense[]) {
  const monthMap = new Map<string, number>();

  expenses.forEach((expense) => {
    const parsedDate = parseExpenseDate(expense.date);

    if (Number.isNaN(parsedDate.getTime())) return;

    const key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    monthMap.set(key, (monthMap.get(key) || 0) + expense.amount);
  });

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [year, month] = key.split("-");
      const label = new Date(`${year}-${month}-01T00:00:00`).toLocaleDateString(
        "en-IN",
        {
          month: "short",
          year: "2-digit",
        }
      );

      return {
        monthKey: key,
        label,
        value: Number(value.toFixed(2)),
      };
    });
}

function buildSummary(expenses: Expense[]) {
  const totals = expenses.reduce(
    (acc, exp) => {
      acc.amount += exp.amount;
      acc.r += exp.rishabhShare;
      acc.t += exp.tejalShare;
      return acc;
    },
    { amount: 0, r: 0, t: 0 }
  );

  const paidTotals = expenses.reduce(
    (acc, exp) => {
      if (exp.paidBy === "Rishabh") acc.r += exp.amount;
      if (exp.paidBy === "Tejal") acc.t += exp.amount;
      return acc;
    },
    { r: 0, t: 0 }
  );

  const netBalance = Number(
    ((paidTotals.r - totals.r) - (paidTotals.t - totals.t)).toFixed(2)
  );

  const totalAmount = totals.amount;
  const sharePercentages =
    totalAmount > 0
      ? {
          rishabhOwes: (totals.r / totalAmount) * 100,
          tejalOwes: (totals.t / totalAmount) * 100,
          rishabhPaid: (paidTotals.r / totalAmount) * 100,
          tejalPaid: (paidTotals.t / totalAmount) * 100,
        }
      : {
          rishabhOwes: 0,
          tejalOwes: 0,
          rishabhPaid: 0,
          tejalPaid: 0,
        };

  return { totals, paidTotals, netBalance, sharePercentages };
}

function normalizeEntry(rawEntry: Expense): Expense {
  const inferredEntryType =
    rawEntry.entryType ??
    (rawEntry.category === "Loan"
      ? "loan"
      : rawEntry.category === "Cash Top-up"
      ? "cash"
      : "expense");

  let borrower = rawEntry.borrower || "";

  if (inferredEntryType === "loan" && !borrower) {
    if (rawEntry.rishabhShare > 0 && rawEntry.tejalShare === 0) {
      borrower = "Rishabh";
    } else if (rawEntry.tejalShare > 0 && rawEntry.rishabhShare === 0) {
      borrower = "Tejal";
    }
  }

  return {
    ...rawEntry,
    entryType: inferredEntryType,
    borrower,
    category:
      inferredEntryType === "loan"
        ? "Loan"
      : inferredEntryType === "cash"
        ? "Cash"
        : rawEntry.category,
  };
}

function getLoanSettlementImpact(entries: Expense[]) {
  return Number(
    entries
      .filter((entry) => entry.entryType === "loan")
      .reduce((net, entry) => {
        if (entry.borrower === "Tejal") return net + entry.amount;
        if (entry.borrower === "Rishabh") return net - entry.amount;
        return net;
      }, 0)
      .toFixed(2)
  );
}

function renderSettlementMessage(netBalance: number) {
  if (netBalance > 0) {
    return `Tejal owes Rishabh ${formatCurrency(netBalance)}`;
  }

  if (netBalance < 0) {
    return `Rishabh owes Tejal ${formatCurrency(Math.abs(netBalance))}`;
  }

  return "All settled.";
}

function SettlementCard({
  title,
  openingBalance,
  periodBalance,
}: {
  title: string;
  openingBalance: number;
  periodBalance: number;
}) {
  const overallBalance = Number(
    (openingBalance + periodBalance).toFixed(2)
  );

  return (
    <div
      style={{
        ...cardStyle,
        background:
          overallBalance > 0
            ? "#ecfdf5"
            : overallBalance < 0
            ? "#fff7ed"
            : "#f9fafb",
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, color: "#4b5563" }}>
          Opening balance before Jan 2026: {renderSettlementMessage(openingBalance)}
        </p>
        <p style={{ margin: 0, color: "#4b5563" }}>
          This view changes the balance by: {renderSettlementMessage(periodBalance)}
        </p>
        <p style={{ margin: "4px 0 0", fontWeight: 700 }}>
          Overall outstanding: {renderSettlementMessage(overallBalance)}
        </p>
      </div>
    </div>
  );
}

function SummaryCards({
  titlePrefix,
  totals,
  paidTotals,
}: {
  titlePrefix: string;
  totals: { amount: number };
  paidTotals: { r: number; t: number };
}) {
  return (
    <div style={summaryGridStyle}>
      <div style={cardStyle}>
        <div style={{ color: "#6b7280", fontSize: 13 }}>{titlePrefix} Total</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>
          {formatCurrency(totals.amount)}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ color: "#6b7280", fontSize: 13 }}>Paid by Rishabh</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>
          {formatCurrency(paidTotals.r)}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ color: "#6b7280", fontSize: 13 }}>Paid by Tejal</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>
          {formatCurrency(paidTotals.t)}
        </div>
      </div>
    </div>
  );
}

function ShareBreakdown({
  title,
  totalAmount,
  leftLabel,
  rightLabel,
  leftAmount,
  rightAmount,
  leftPercentage,
  rightPercentage,
}: {
  title: string;
  totalAmount: number;
  leftLabel: string;
  rightLabel: string;
  leftAmount: number;
  rightAmount: number;
  leftPercentage: number;
  rightPercentage: number;
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ margin: "0 0 16px", color: "#6b7280" }}>
        Out of {formatCurrency(totalAmount)}, here is the split.
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span>{leftLabel}</span>
            <span>
              {formatCurrency(leftAmount)} ({formatNumber(leftPercentage)}%)
            </span>
          </div>
          <div
            style={{
              height: 12,
              background: "#e5e7eb",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(leftPercentage, 100)}%`,
                height: "100%",
                background: "#0f766e",
                borderRadius: 999,
              }}
            />
          </div>
        </div>

        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span>{rightLabel}</span>
            <span>
              {formatCurrency(rightAmount)} ({formatNumber(rightPercentage)}%)
            </span>
          </div>
          <div
            style={{
              height: 12,
              background: "#e5e7eb",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(rightPercentage, 100)}%`,
                height: "100%",
                background: "#f59e0b",
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartsSection({
  title,
  categoryData,
  isMobile,
}: {
  title: string;
  categoryData: { name: string; value: number }[];
  isMobile: boolean;
}) {
  const mobileChartHeight = Math.max(320, categoryData.length * 44);
  const totalAmount = categoryData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 20,
      }}
    >
      <div style={{ ...cardStyle, minHeight: 360 }}>
        <h3 style={{ marginTop: 0 }}>{title} by Category</h3>
        {categoryData.length > 0 && (
          <p style={{ margin: "6px 0 14px", color: "#4b5563", fontWeight: 600 }}>
            Total Spend: <span style={{ color: "#111827" }}>{formatCurrency(totalAmount)}</span>
          </p>
        )}
        {categoryData.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No expense data available for this view.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={96}
                paddingAngle={2}
              >
                {categoryData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => {
                  const normalizedValue = Number(Array.isArray(value) ? value[0] : value ?? 0);
                  const percentage = totalAmount > 0 ? (normalizedValue / totalAmount) * 100 : 0;
                  return formatPercentage(percentage);
                }}
              />
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{ paddingTop: 16 }}
                formatter={(value) => value}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ ...cardStyle, minHeight: 360 }}>
        <h3 style={{ marginTop: 0 }}>{title} Breakdown</h3>
        {categoryData.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No expense data available for this view.</p>
        ) : (
          <ResponsiveContainer width="100%" height={isMobile ? mobileChartHeight : 300}>
            <BarChart
              layout={isMobile ? "vertical" : "horizontal"}
              data={categoryData}
              margin={
                isMobile
                  ? { top: 10, right: 12, left: 8, bottom: 0 }
                  : { top: 10, right: 10, left: 12, bottom: 24 }
              }
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              {isMobile ? (
                <>
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                    tick={{ fontSize: 11 }}
                    scale="sqrt"
                    domain={[0, "auto"]}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={104}
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey="name"
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                    height={60}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                    width={100}
                    tick={{ fontSize: 12 }}
                    scale="sqrt"
                    domain={[0, "auto"]}
                  />
                </>
              )}
              <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} minPointSize={6}>
                {categoryData.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function MonthlyComparisonChart({
  data,
  isMobile,
}: {
  data: { monthKey: string; label: string; value: number }[];
  isMobile: boolean;
}) {
  const mobileChartHeight = Math.max(280, data.length * 52);

  return (
    <div style={{ ...cardStyle, minHeight: 380 }}>
      <h3 style={{ marginTop: 0 }}>Monthly Expense Comparison</h3>
      {data.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No expense data available for monthly comparison.</p>
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? mobileChartHeight : 320}>
          <BarChart
            data={data}
            layout={isMobile ? "vertical" : "horizontal"}
            margin={
              isMobile
                ? { top: 10, right: 12, left: 8, bottom: 0 }
                : { top: 10, right: 10, left: 12, bottom: 24 }
            }
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            {isMobile ? (
              <>
                <XAxis
                  type="number"
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={70}
                  tick={{ fontSize: 12 }}
                  interval={0}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="label"
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  width={100}
                  tick={{ fontSize: 12 }}
                />
              </>
            )}
            <Tooltip
              formatter={formatTooltipValue}
              labelFormatter={(label) => `Month: ${label}`}
            />
            <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [lastSeenEmail, setLastSeenEmail] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [borrower, setBorrower] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("add");

  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [rishabhShare, setRishabhShare] = useState("");
  const [tejalShare, setTejalShare] = useState("");

  const [filterMonth, setFilterMonth] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterType, setFilterType] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCashPool, setIsSavingCashPool] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [initialCashPoolBalance, setInitialCashPoolBalance] = useState(
    DEFAULT_INITIAL_CASH_POOL_BALANCE
  );
  const [isEditingCashPool, setIsEditingCashPool] = useState(false);
  const [cashPoolInput, setCashPoolInput] = useState(
    String(DEFAULT_INITIAL_CASH_POOL_BALANCE)
  );

  const resetForm = () => {
    setEntryType("expense");
    setAmount("");
    setCategory("");
    setPaidBy("");
    setBorrower("");
    setDate("");
    setDescription("");
    setSplitType("equal");
    setRishabhShare("");
    setTejalShare("");
    setEditingId(null);
  };

  const fetchExpenses = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const querySnapshot = await getDocs(collection(db, "expenses"));
      const data = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Expense, "id">),
      }));

      setExpenses(data.map(normalizeEntry));
    } catch {
      setErrorMessage("Could not load expenses. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, "settings", SETTINGS_DOC_ID));
      if (!settingsDoc.exists()) {
        setInitialCashPoolBalance(DEFAULT_INITIAL_CASH_POOL_BALANCE);
        setCashPoolInput(String(DEFAULT_INITIAL_CASH_POOL_BALANCE));
        return;
      }

      const savedBalance = Number(settingsDoc.data().initialCashPoolBalance);
      if (Number.isFinite(savedBalance)) {
        setInitialCashPoolBalance(savedBalance);
        setCashPoolInput(String(savedBalance));
      }
    } catch {
      setErrorMessage("Could not load cash pool settings. Using the current default value.");
    }
  };

  useEffect(() => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    auth.languageCode = "en";

    setPersistence(auth, browserLocalPersistence)
      .then(() => getRedirectResult(auth))
      .then((result) => {
        if (!result?.user && typeof window !== "undefined") {
          const attemptedSignIn = window.sessionStorage.getItem(AUTH_ATTEMPT_KEY);
          if (attemptedSignIn) {
            setAuthError(
              "Google sign-in returned to the app, but no authenticated session was created. Please try again."
            );
            window.sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
          }
        }
      })
      .catch(() => {
        setAuthError("Could not complete sign-in. Please try again.");
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
        }
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (typeof window !== "undefined") {
          const attemptedSignIn = window.sessionStorage.getItem(AUTH_ATTEMPT_KEY);
          if (attemptedSignIn && !authError) {
            setAuthError(
              "Google sign-in finished, but Firebase did not restore a user session. This usually means the auth callback completed without persisting the login."
            );
            window.sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
          }
        }
        setCurrentUser(null);
        setLastSeenEmail("");
        setExpenses([]);
        setIsLoading(false);
        setAuthReady(true);
        return;
      }

      setLastSeenEmail(user.email ?? "");

      if (!ALLOWED_EMAILS.length) {
        setCurrentUser(null);
        setAuthError(
          "Allowed emails are not configured yet. Add NEXT_PUBLIC_ALLOWED_EMAILS in Vercel and locally."
        );
        await signOut(auth);
        setAuthReady(true);
        return;
      }

      if (!isAllowedEmail(user.email)) {
        setCurrentUser(null);
        setAuthError("This Google account is not allowed to use this app.");
        await signOut(auth);
        setAuthReady(true);
        return;
      }

      setAuthError("");
      setCurrentUser(user);
      setAuthReady(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
      }
      fetchExpenses();
      fetchSettings();
    });

    return () => unsubscribe();
  }, [authError]);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 640);

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    setAuthError("");
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(AUTH_ATTEMPT_KEY, "1");
      }
      await setPersistence(auth, browserLocalPersistence);
      try {
        const result = await signInWithPopup(auth, provider);
        if (result.user) {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
          }
          setAuthError("");
          return;
        }
      } catch (popupError) {
        const authCode =
          typeof popupError === "object" &&
          popupError !== null &&
          "code" in popupError &&
          typeof popupError.code === "string"
            ? popupError.code
            : "";

        const shouldFallbackToRedirect =
          isMobile ||
          authCode === "auth/popup-blocked" ||
          authCode === "auth/cancelled-popup-request" ||
          authCode === "auth/popup-closed-by-user" ||
          authCode === "auth/operation-not-supported-in-this-environment";

        if (!shouldFallbackToRedirect) {
          throw popupError;
        }
      }

      await signInWithRedirect(auth, provider);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google sign-in could not be started.";
      setAuthError(message);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  const calculateSplit = () => {
    const amt = Number(amount);

    if (!amt || amt <= 0) {
      setErrorMessage("Please enter a valid amount greater than 0.");
      return null;
    }

    if (splitType === "equal") {
      const half = Number((amt / 2).toFixed(2));
      return { r: half, t: Number((amt - half).toFixed(2)) };
    }

    if (splitType === "tejal") {
      return { r: 0, t: amt };
    }

    if (splitType === "rishabh") {
      return { r: amt, t: 0 };
    }

    const r = Number(rishabhShare);
    const t = Number(tejalShare);

    if (r < 0 || t < 0) {
      setErrorMessage("Custom split values cannot be negative.");
      return null;
    }

    if (Number((r + t).toFixed(2)) !== Number(amt.toFixed(2))) {
      setErrorMessage("Custom split must exactly match the total amount.");
      return null;
    }

    return { r, t };
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");

    if (!paidBy || !date) {
      setErrorMessage("Please fill in amount, paid by, and date.");
      return;
    }

    if (entryType === "expense" && !category) {
      setErrorMessage("Please choose an expense category.");
      return;
    }

    if (entryType === "loan" && !borrower) {
      setErrorMessage("Please choose who owes this loan.");
      return;
    }

    if (entryType === "loan" && borrower === paidBy) {
      setErrorMessage("For a loan, the lender and borrower must be different people.");
      return;
    }

    const split =
      entryType === "loan"
        ? { r: 0, t: 0 }
        : calculateSplit();
    if (!split) return;

    const expenseData: ExpensePayload = {
      entryType,
      amount: Number(amount),
      category:
        entryType === "loan"
          ? "Loan"
          : entryType === "cash"
          ? "Cash"
          : category,
      paidBy,
      date,
      description: description.trim(),
      rishabhShare: split.r,
      tejalShare: split.t,
      borrower: entryType === "loan" ? borrower : "",
    };

    setIsSaving(true);

    try {
      if (editingId) {
        await updateDoc(doc(db, "expenses", editingId), expenseData);
      } else {
        await addDoc(collection(db, "expenses"), expenseData);
      }

      resetForm();
      await fetchExpenses();
      setActiveTab("list");
    } catch {
      setErrorMessage(
        editingId
          ? "Could not update the expense. Please try again."
          : "Could not save the expense. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this expense?");
    if (!confirmed) return;

    setErrorMessage("");

    try {
      await deleteDoc(doc(db, "expenses", id));
      await fetchExpenses();
    } catch {
      setErrorMessage("Could not delete the expense. Please try again.");
    }
  };

  const handleCashPoolSave = async () => {
    const nextValue = Number(cashPoolInput);

    if (!Number.isFinite(nextValue) || nextValue < 0) {
      setErrorMessage("Please enter a valid cash pool amount.");
      return;
    }

    setIsSavingCashPool(true);
    setErrorMessage("");

    try {
      await setDoc(
        doc(db, "settings", SETTINGS_DOC_ID),
        { initialCashPoolBalance: nextValue },
        { merge: true }
      );
      setInitialCashPoolBalance(nextValue);
      setCashPoolInput(String(nextValue));
      setIsEditingCashPool(false);
    } catch {
      setErrorMessage("Could not update the cash pool. Please try again.");
    } finally {
      setIsSavingCashPool(false);
    }
  };

  const handleEdit = (exp: Expense) => {
    const normalizedEntry = normalizeEntry(exp);
    const nextEntryType = normalizedEntry.entryType ?? "expense";
    setEntryType(nextEntryType);
    setAmount(String(normalizedEntry.amount));
    setCategory(
      nextEntryType === "expense" ? normalizedEntry.category : ""
    );
    setPaidBy(normalizedEntry.paidBy);
    setBorrower(normalizedEntry.borrower || "");
    setDate(toDateInputValue(normalizedEntry.date));
    setDescription(normalizedEntry.description || "");
    setRishabhShare(String(normalizedEntry.rishabhShare));
    setTejalShare(String(normalizedEntry.tejalShare));
    setSplitType(nextEntryType === "loan" ? "equal" : "custom");
    setEditingId(normalizedEntry.id);
    setErrorMessage("");
    setActiveTab("add");
  };

  const filteredEntries = expenses.filter((exp) => {
    const expDate = parseExpenseDate(exp.date);

    if (Number.isNaN(expDate.getTime())) {
      return false;
    }

    if (filterMonth) {
      const expMonth = String(expDate.getMonth() + 1).padStart(2, "0");
      const expYear = String(expDate.getFullYear());
      const expMonthYear = `${expYear}-${expMonth}`;

      if (expMonthYear !== filterMonth) {
        return false;
      }
    }

    if (filterFromDate) {
      const fromDate = new Date(`${filterFromDate}T00:00:00`);
      if (expDate < fromDate) {
        return false;
      }
    }

    if (filterToDate) {
      const toDate = new Date(`${filterToDate}T23:59:59.999`);
      if (expDate > toDate) {
        return false;
      }
    }

    if (filterType && exp.category !== filterType) {
      return false;
    }

    return true;
  });

  const filteredExpensesOnly = filteredEntries.filter(
    (entry) => (entry.entryType ?? "expense") === "expense"
  );
  const filteredCashEntries = filteredEntries.filter(
    (entry) => (entry.entryType ?? "expense") === "cash"
  );

  const sortedFilteredEntries = [...filteredEntries].sort((a, b) => {
    return parseExpenseDate(b.date).getTime() - parseExpenseDate(a.date).getTime();
  });

  const uniqueMonths = Array.from(
    new Set(
      expenses
        .map((exp) => {
          const expDate = parseExpenseDate(exp.date);
          if (Number.isNaN(expDate.getTime())) return "";

          const month = String(expDate.getMonth() + 1).padStart(2, "0");
          const year = String(expDate.getFullYear());
          return `${year}-${month}`;
        })
        .filter(Boolean)
    )
  ).sort().reverse();

  const uniqueTypes = Array.from(new Set(expenses.map((exp) => exp.category))).sort();
  const now = new Date();
  const currentMonthEntries = expenses.filter((exp) => {
    const expDate = parseExpenseDate(exp.date);
    return !Number.isNaN(expDate.getTime()) && isSameMonth(expDate, now);
  });
  const currentMonthExpenses = currentMonthEntries.filter(
    (entry) => (entry.entryType ?? "expense") === "expense"
  );
  const currentMonthCashEntries = currentMonthEntries.filter(
    (entry) => (entry.entryType ?? "expense") === "cash"
  );

  const filteredSummary = buildSummary(filteredExpensesOnly);
  const currentMonthSummary = buildSummary(currentMonthExpenses);
  const filteredCashSummary = buildSummary(filteredCashEntries);
  const currentMonthCashSummary = buildSummary(currentMonthCashEntries);
  const filteredCategoryData = buildCategoryData(
    filteredEntries.filter((entry) => (entry.entryType ?? "expense") !== "loan")
  );
  const currentMonthCategoryData = buildCategoryData(
    currentMonthEntries.filter((entry) => (entry.entryType ?? "expense") !== "loan")
  );
  const currentMonthLabel = now.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const allExpenseEntries = expenses.filter(
    (entry) => (entry.entryType ?? "expense") === "expense"
  );
  const allChartEntries = expenses.filter(
    (entry) => (entry.entryType ?? "expense") !== "loan"
  );
  const allCashEntries = expenses.filter(
    (entry) => (entry.entryType ?? "expense") === "cash"
  );
  const monthlyComparisonData = buildMonthlyExpenseData(allChartEntries);
  const allTimeSummary = buildSummary(allExpenseEntries);
  const allTimeCashSummary = buildSummary(allCashEntries);
  const allTimeLoanImpact = getLoanSettlementImpact(expenses);
  const currentMonthLoanImpact = getLoanSettlementImpact(currentMonthEntries);
  const filteredLoanImpact = getLoanSettlementImpact(filteredEntries);
  const currentCashPoolBalance = Number(
    (initialCashPoolBalance + allCashEntries.reduce((sum, entry) => sum + entry.amount, 0)).toFixed(2)
  );
  const trackedDataSettlementImpact = Number(
    (allTimeSummary.netBalance + allTimeCashSummary.netBalance + allTimeLoanImpact).toFixed(2)
  );
  const openingBalanceBefore2026 = OPENING_BALANCE_BEFORE_2026;
  const overallSettlementBalance = Number(
    (openingBalanceBefore2026 + trackedDataSettlementImpact).toFixed(2)
  );

  if (!authReady) {
    return (
      <div style={containerStyle}>
        <div style={authCardStyle}>
          <h1 style={{ marginTop: 0, fontSize: 30 }}>Checking access...</h1>
          <p style={{ marginBottom: 0, color: "#4b5563" }}>
            We&apos;re verifying your sign-in before loading the expense tracker.
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={containerStyle}>
        <div style={authCardStyle}>
          <div
            style={{
              display: "inline-block",
              marginBottom: 12,
              padding: "6px 10px",
              borderRadius: 999,
              background: "#eef2ff",
              color: "#3730a3",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Private Access
          </div>
          <h1 style={{ marginTop: 0, fontSize: 30 }}>Sign in to continue</h1>
          <p style={{ color: "#4b5563", lineHeight: 1.6 }}>
            This expense tracker is limited to approved Google accounts only. Sign in with your
            Google account to continue on web or phone.
          </p>
          {authError && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                borderRadius: 12,
              }}
            >
              {authError}
            </div>
          )}
          {!authError && lastSeenEmail && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                background: "#fff7ed",
                color: "#9a3412",
                border: "1px solid #fdba74",
                borderRadius: 12,
              }}
            >
              Signed in as {lastSeenEmail}, but access is still being checked.
            </div>
          )}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            style={{
              width: "100%",
              padding: "14px 16px",
              border: "none",
              borderRadius: 12,
              background: "#111827",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          ...cardStyle,
          marginBottom: 20,
          background:
            "linear-gradient(135deg, rgba(15,118,110,0.08), rgba(245,158,11,0.08))",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32 }}>Expense Tracker</h1>
        <p style={{ margin: "8px 0 0", color: "#4b5563" }}>
          Add, split, filter, and review shared expenses in one place.
        </p>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "#4b5563", fontSize: 14 }}>
            Signed in as <strong>{currentUser.email}</strong>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#111827",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div
        style={{
          ...cardStyle,
          marginBottom: 20,
          border:
            overallSettlementBalance > 0
              ? "1px solid #86efac"
              : overallSettlementBalance < 0
              ? "1px solid #fdba74"
              : "1px solid #d1d5db",
          background:
            overallSettlementBalance > 0
              ? "linear-gradient(135deg, #ecfdf5, #f0fdf4)"
              : overallSettlementBalance < 0
              ? "linear-gradient(135deg, #fff7ed, #fffbeb)"
              : "linear-gradient(135deg, #f9fafb, #ffffff)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#4b5563",
          }}
        >
          Total Settlement Balance
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>
          {renderSettlementMessage(overallSettlementBalance)}
        </div>
      </div>

      <div
        style={{
          ...cardStyle,
          marginBottom: 20,
          background: "linear-gradient(135deg, #eff6ff, #f8fafc)",
          border: "1px solid #bfdbfe",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#4b5563",
          }}
        >
          Current Cash Pool
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>
          {formatCurrency(currentCashPoolBalance)}
        </div>
        {isEditingCashPool ? (
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cashPoolInput}
              onChange={(e) => setCashPoolInput(e.target.value)}
              style={{ ...inputStyle, maxWidth: 240 }}
            />
            <button
              type="button"
              onClick={handleCashPoolSave}
              disabled={isSavingCashPool}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "#ffffff",
                cursor: isSavingCashPool ? "not-allowed" : "pointer",
                fontWeight: 700,
                opacity: isSavingCashPool ? 0.7 : 1,
              }}
            >
              {isSavingCashPool ? "Saving..." : "Save Cash Pool"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCashPoolInput(String(initialCashPoolBalance));
                setIsEditingCashPool(false);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ margin: 0, color: "#4b5563" }}>
              Based on starting cash pool of {formatCurrency(initialCashPoolBalance)} plus all
              tracked cash additions.
            </p>
            <button
              type="button"
              onClick={() => setIsEditingCashPool(true)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Edit Cash Pool
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          margin: "20px 0",
        }}
      >
        {(["add", "monthly", "list"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: activeTab === tab ? "#111827" : "#ffffff",
              color: activeTab === tab ? "#ffffff" : "#111827",
              border: "1px solid #d1d5db",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {tab === "add"
              ? "Add Expense"
              : tab === "monthly"
              ? "This Month"
              : "All Expenses"}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            borderRadius: 12,
          }}
        >
          {errorMessage}
        </div>
      )}

      {activeTab === "add" && (
        <form
          onSubmit={handleSubmit}
          style={{
            ...cardStyle,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 680,
            margin: "0 auto",
            width: "100%",
          }}
        >
          <div>
            <label style={labelStyle}>Entry Type</label>
            <select
              value={entryType}
              onChange={(e) => {
                const nextType = e.target.value as EntryType;
                setEntryType(nextType);
                setErrorMessage("");
                if (nextType === "loan") {
                  setCategory("");
                  setSplitType("equal");
                  setRishabhShare("");
                  setTejalShare("");
                } else if (nextType === "cash") {
                  setCategory("Cash");
                  setBorrower("");
                  setSplitType("equal");
                  setRishabhShare("");
                  setTejalShare("");
                } else {
                  setBorrower("");
                }
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
                <option value="expense">Expense</option>
                <option value="loan">Loan</option>
                <option value="cash">Cash Added</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
            />
          </div>

          {entryType === "expense" && (
            <div>
              <label style={labelStyle}>Expense Type</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Select expense</option>
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>
              {entryType === "loan"
                ? "Loan Given By"
                : entryType === "cash"
                ? "Cash Added By"
                : "Who Paid"}
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Select person</option>
              <option value="Rishabh">Rishabh</option>
              <option value="Tejal">Tejal</option>
            </select>
          </div>

          {entryType === "loan" ? (
            <div>
              <label style={labelStyle}>Who Owes This Loan</label>
              <select
                value={borrower}
                onChange={(e) => setBorrower(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">Select person</option>
                <option value="Rishabh">Rishabh</option>
                <option value="Tejal">Tejal</option>
              </select>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>
                  {entryType === "cash" ? "How This Cash Addition Is Shared" : "How to Split"}
                </label>
                <select
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value as SplitType)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="equal">50:50</option>
                  <option value="tejal">Tejal owes all</option>
                  <option value="rishabh">Rishabh owes all</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {splitType === "custom" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Rishabh share"
                    value={rishabhShare}
                    onChange={(e) => setRishabhShare(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Tejal share"
                    value={tejalShare}
                    onChange={(e) => setTejalShare(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              placeholder="Add any notes or details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: "12px 16px",
                background: "#111827",
                color: "#ffffff",
                borderRadius: 12,
                cursor: isSaving ? "not-allowed" : "pointer",
                border: "none",
                fontWeight: 700,
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? "Saving..." : editingId ? "Update Entry" : "Add Entry"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: "12px 16px",
                  background: "#ffffff",
                  color: "#111827",
                  borderRadius: 12,
                  cursor: "pointer",
                  border: "1px solid #d1d5db",
                  fontWeight: 600,
                }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === "monthly" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={cardStyle}>
            <h2 style={{ margin: 0 }}>Monthly Overview</h2>
            <p style={{ margin: "8px 0 0", color: "#6b7280" }}>
              Showing summary and charts for {currentMonthLabel}.
            </p>
          </div>

          <SummaryCards
            titlePrefix="This Month"
            totals={currentMonthSummary.totals}
            paidTotals={currentMonthSummary.paidTotals}
          />

          {currentMonthCashEntries.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 20,
              }}
            >
              <ShareBreakdown
                title="Cash Top-up Share"
                totalAmount={currentMonthCashSummary.totals.amount}
                leftLabel="Rishabh's top-up share"
                rightLabel="Tejal's top-up share"
                leftAmount={currentMonthCashSummary.totals.r}
                rightAmount={currentMonthCashSummary.totals.t}
                leftPercentage={currentMonthCashSummary.sharePercentages.rishabhOwes}
                rightPercentage={currentMonthCashSummary.sharePercentages.tejalOwes}
              />

              <ShareBreakdown
                title="Cash Top-up Funding"
                totalAmount={currentMonthCashSummary.totals.amount}
                leftLabel="Added by Rishabh"
                rightLabel="Added by Tejal"
                leftAmount={currentMonthCashSummary.paidTotals.r}
                rightAmount={currentMonthCashSummary.paidTotals.t}
                leftPercentage={currentMonthCashSummary.sharePercentages.rishabhPaid}
                rightPercentage={currentMonthCashSummary.sharePercentages.tejalPaid}
              />
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            <ShareBreakdown
              title="Expense Share"
              totalAmount={currentMonthSummary.totals.amount}
              leftLabel="Rishabh's share"
              rightLabel="Tejal's share"
              leftAmount={currentMonthSummary.totals.r}
              rightAmount={currentMonthSummary.totals.t}
              leftPercentage={currentMonthSummary.sharePercentages.rishabhOwes}
              rightPercentage={currentMonthSummary.sharePercentages.tejalOwes}
            />

            <ShareBreakdown
              title="Paid Share"
              totalAmount={currentMonthSummary.totals.amount}
              leftLabel="Paid by Rishabh"
              rightLabel="Paid by Tejal"
              leftAmount={currentMonthSummary.paidTotals.r}
              rightAmount={currentMonthSummary.paidTotals.t}
              leftPercentage={currentMonthSummary.sharePercentages.rishabhPaid}
              rightPercentage={currentMonthSummary.sharePercentages.tejalPaid}
            />
          </div>

          <SettlementCard
            title="Settlement Summary"
            openingBalance={openingBalanceBefore2026}
            periodBalance={Number(
              (
                currentMonthSummary.netBalance +
                currentMonthCashSummary.netBalance +
                currentMonthLoanImpact
              ).toFixed(2)
            )}
          />

          <ChartsSection
            title="This Month"
            categoryData={currentMonthCategoryData}
            isMobile={isMobile}
          />
        </div>
      )}

      {activeTab === "list" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>All Expenses</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelStyle}>Month</label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">All Months</option>
                  {uniqueMonths.map((month) => (
                    <option key={month} value={month}>
                      {new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {
                        month: "long",
                        year: "numeric",
                      })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>From Date</label>
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>To Date</label>
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Expense Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">All Types</option>
                  {uniqueTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setFilterMonth("");
                  setFilterFromDate("");
                  setFilterToDate("");
                  setFilterType("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Clear Filters
              </button>
              <div style={{ alignSelf: "center", color: "#6b7280", fontSize: 14 }}>
                Showing {sortedFilteredEntries.length} of {expenses.length} entries
              </div>
            </div>
          </div>

          <SummaryCards
            titlePrefix="Filtered"
            totals={filteredSummary.totals}
            paidTotals={filteredSummary.paidTotals}
          />

          {filteredCashEntries.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 20,
              }}
            >
              <ShareBreakdown
                title="Cash Top-up Share"
                totalAmount={filteredCashSummary.totals.amount}
                leftLabel="Rishabh's top-up share"
                rightLabel="Tejal's top-up share"
                leftAmount={filteredCashSummary.totals.r}
                rightAmount={filteredCashSummary.totals.t}
                leftPercentage={filteredCashSummary.sharePercentages.rishabhOwes}
                rightPercentage={filteredCashSummary.sharePercentages.tejalOwes}
              />

              <ShareBreakdown
                title="Cash Top-up Funding"
                totalAmount={filteredCashSummary.totals.amount}
                leftLabel="Added by Rishabh"
                rightLabel="Added by Tejal"
                leftAmount={filteredCashSummary.paidTotals.r}
                rightAmount={filteredCashSummary.paidTotals.t}
                leftPercentage={filteredCashSummary.sharePercentages.rishabhPaid}
                rightPercentage={filteredCashSummary.sharePercentages.tejalPaid}
              />
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            <ShareBreakdown
              title="Expense Share"
              totalAmount={filteredSummary.totals.amount}
              leftLabel="Rishabh's share"
              rightLabel="Tejal's share"
              leftAmount={filteredSummary.totals.r}
              rightAmount={filteredSummary.totals.t}
              leftPercentage={filteredSummary.sharePercentages.rishabhOwes}
              rightPercentage={filteredSummary.sharePercentages.tejalOwes}
            />

            <ShareBreakdown
              title="Paid Share"
              totalAmount={filteredSummary.totals.amount}
              leftLabel="Paid by Rishabh"
              rightLabel="Paid by Tejal"
              leftAmount={filteredSummary.paidTotals.r}
              rightAmount={filteredSummary.paidTotals.t}
              leftPercentage={filteredSummary.sharePercentages.rishabhPaid}
              rightPercentage={filteredSummary.sharePercentages.tejalPaid}
            />
          </div>

          <SettlementCard
            title="Filtered Settlement Summary"
            openingBalance={openingBalanceBefore2026}
            periodBalance={Number(
              (
                filteredSummary.netBalance +
                filteredCashSummary.netBalance +
                filteredLoanImpact
              ).toFixed(2)
            )}
          />

          <ChartsSection
            title="Filtered Spend"
            categoryData={filteredCategoryData}
            isMobile={isMobile}
          />

          <MonthlyComparisonChart data={monthlyComparisonData} isMobile={isMobile} />

          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            {isLoading ? (
              <div style={{ padding: 20, color: "#6b7280" }}>Loading expenses...</div>
            ) : sortedFilteredEntries.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
                No entries found with the selected filters.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>Date</th>
                      <th style={tableHeaderStyle}>Entry Type</th>
                      <th style={tableHeaderStyle}>Category</th>
                      <th style={tableHeaderStyle}>Description</th>
                      <th style={tableHeaderStyle}>Paid / Given By</th>
                      <th style={tableHeaderStyle}>Amount</th>
                      <th style={tableHeaderStyle}>Rishabh Share</th>
                      <th style={tableHeaderStyle}>Tejal Share</th>
                      <th style={tableHeaderStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFilteredEntries.map((exp) => (
                      <tr key={exp.id}>
                        <td style={tableCellStyle}>{formatDate(exp.date)}</td>
                        <td style={tableCellStyle}>
                          {(exp.entryType ?? "expense") === "loan"
                            ? "Loan"
                            : (exp.entryType ?? "expense") === "cash"
                            ? "Cash Top-up"
                            : "Expense"}
                        </td>
                        <td style={tableCellStyle}>
                          {(exp.entryType ?? "expense") === "loan"
                            ? exp.borrower
                              ? `Loan owed by ${exp.borrower}`
                              : "Loan"
                            : (exp.entryType ?? "expense") === "cash"
                            ? "Cash Top-up"
                            : exp.category}
                        </td>
                        <td style={tableCellStyle}>{exp.description || "-"}</td>
                        <td style={tableCellStyle}>{exp.paidBy}</td>
                        <td style={tableCellStyle}>{formatCurrency(exp.amount)}</td>
                        <td style={tableCellStyle}>
                          {(exp.entryType ?? "expense") === "loan"
                            ? "-"
                            : formatCurrency(exp.rishabhShare)}
                        </td>
                        <td style={tableCellStyle}>
                          {(exp.entryType ?? "expense") === "loan"
                            ? "-"
                            : formatCurrency(exp.tejalShare)}
                        </td>
                        <td style={tableCellStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              onClick={() => handleEdit(exp)}
                              style={{
                                cursor: "pointer",
                                border: "1px solid #d1d5db",
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: "#ffffff",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(exp.id)}
                              style={{
                                cursor: "pointer",
                                border: "1px solid #fecaca",
                                padding: "8px 10px",
                                borderRadius: 8,
                                background: "#fef2f2",
                                color: "#b91c1c",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
