async function main() {
  const token = process.env.TEST_BEARER_TOKEN ?? "";
  const baseUrl = process.env.TEST_API_BASE_URL ?? "http://localhost:3000";

  if (!token) {
    throw new Error("Missing TEST_BEARER_TOKEN env var.");
  }

  const payload = {
    username: "sample_buyer",
    phone: "+923001234567",
    address: "House 12 Street 4 DHA Lahore Pakistan",
    messages: [
      { role: "seller", text: "Hello! Please confirm your order details." },
      { role: "buyer", text: "Yes but I may confirm tomorrow maybe." },
      { role: "seller", text: "Please share your full address and phone." },
      { role: "buyer", text: "I will send after salary comes." }
    ]
  };

  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error("Analyze test failed:", error);
  process.exit(1);
});
