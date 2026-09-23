import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * UK-flavoured default categories. Names are the contract used by the
 * builtin merchant dictionary (lib/categorize/uk-merchants.ts) — renaming a
 * seeded category breaks builtin categorisation for it.
 */
const CATEGORIES: { name: string; type: string; color: string; icon: string }[] = [
  { name: "Groceries", type: "expense", color: "#22c55e", icon: "🛒" },
  { name: "Eating Out", type: "expense", color: "#f97316", icon: "🍽️" },
  { name: "Coffee & Snacks", type: "expense", color: "#a16207", icon: "☕" },
  { name: "Transport", type: "expense", color: "#3b82f6", icon: "🚆" },
  { name: "Fuel", type: "expense", color: "#64748b", icon: "⛽" },
  { name: "Shopping", type: "expense", color: "#ec4899", icon: "🛍️" },
  { name: "Clothing", type: "expense", color: "#d946ef", icon: "👕" },
  { name: "Health & Pharmacy", type: "expense", color: "#14b8a6", icon: "💊" },
  { name: "Entertainment", type: "expense", color: "#8b5cf6", icon: "🎬" },
  { name: "Subscriptions", type: "expense", color: "#6366f1", icon: "📺" },
  { name: "Utilities", type: "expense", color: "#eab308", icon: "💡" },
  { name: "Council Tax", type: "expense", color: "#92400e", icon: "🏛️" },
  { name: "Rent & Mortgage", type: "expense", color: "#ef4444", icon: "🏠" },
  { name: "Insurance", type: "expense", color: "#0ea5e9", icon: "🛡️" },
  { name: "Phone & Internet", type: "expense", color: "#06b6d4", icon: "📱" },
  { name: "Home & DIY", type: "expense", color: "#84cc16", icon: "🔨" },
  { name: "Personal Care", type: "expense", color: "#f472b6", icon: "💇" },
  { name: "Kids & Education", type: "expense", color: "#fb923c", icon: "🎓" },
  { name: "Pets", type: "expense", color: "#a3e635", icon: "🐾" },
  { name: "Travel & Holidays", type: "expense", color: "#2dd4bf", icon: "✈️" },
  { name: "Charity", type: "expense", color: "#f43f5e", icon: "❤️" },
  { name: "Cash Withdrawal", type: "expense", color: "#71717a", icon: "🏧" },
  { name: "Fees & Charges", type: "expense", color: "#9ca3af", icon: "🏦" },
  { name: "Savings & Investments", type: "expense", color: "#10b981", icon: "📈" },
  { name: "Transfers", type: "transfer", color: "#94a3b8", icon: "🔁" },
  { name: "Salary", type: "income", color: "#16a34a", icon: "💷" },
  { name: "Other Income", type: "income", color: "#4ade80", icon: "💰" },
];

async function main() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: { type: c.type, color: c.color, icon: c.icon },
      create: c,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
