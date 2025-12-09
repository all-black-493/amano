import { cleanWaitingRooms } from "./clean-up";

async function loop() {
  await cleanWaitingRooms();
  setTimeout(loop, 15 * 1000);
}

loop().catch(console.error);
