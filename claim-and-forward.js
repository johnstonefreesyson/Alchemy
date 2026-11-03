// claim-and-forward.js  (Node 18+, run: npm i ethers)
import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL;      // Ethereum mainnet RPC (Alchemy, Infura, etc.)
const PRIVATE_KEY = process.env.PRIVATE_KEY;  // export from OKX for 0xc62a...ec25
const CONTROLLER  = "0xc62a81dddc1ac7d07c27c093f7346668ffffec25"; // wallet that requested the redemption
const DEST        = "0x72f3e1ab9b98499b4402ef174f7960a46956a940"; // where the rETH should go
const VAULT       = "0x936facdf10c8c36294e7b9d28345255539d81bc7"; // from your URL
const POLL_MS     = 60_000;
const MIN_GAS_ETH = ethers.parseEther("0.002"); // rough floor to cover one claim

const ABI = [
  "function maxRedeem(address controller) view returns (uint256)",
  "function redeem(uint256 shares, address receiver, address controller) returns (uint256)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

if (wallet.address.toLowerCase() !== CONTROLLER.toLowerCase())
  throw new Error(`Key belongs to ${wallet.address}, expected ${CONTROLLER}`);

const vault = new ethers.Contract(VAULT, ABI, wallet);
console.log(`Vault: ${VAULT}\nController: ${CONTROLLER}\nForwarding to: ${DEST}`);

async function tick() {
  const claimable = await vault.maxRedeem(CONTROLLER);
  if (claimable === 0n) return console.log(new Date().toISOString(), "not claimable yet");

  const bal = await provider.getBalance(CONTROLLER);
  if (bal < MIN_GAS_ETH)
    return console.log("Claimable, but ETH for gas is too low:", ethers.formatEther(bal));

  console.log("Claimable shares:", ethers.formatUnits(claimable, 18));
  await vault.redeem.estimateGas(claimable, DEST, CONTROLLER); // throws if it would revert
  const tx = await vault.redeem(claimable, DEST, CONTROLLER);
  console.log("Sent:", tx.hash);
  await tx.wait();
  console.log("Done. Assets sent to", DEST);
  process.exit(0);
}

(async () => {
  while (true) {
    try { await tick(); } catch (e) { console.error("Error:", e.shortMessage || e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
})();
