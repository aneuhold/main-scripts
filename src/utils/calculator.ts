type ResearchTower = {
  damageUpgrade: number;
  shieldUpgrade: number;
  armorUpgrade: number;
};

const researchTowers: ResearchTower[] = [
  {
    damageUpgrade: 0,
    shieldUpgrade: 0,
    armorUpgrade: 10
  },
  {
    damageUpgrade: 0,
    shieldUpgrade: 10,
    armorUpgrade: 0
  },
  {
    damageUpgrade: 10,
    shieldUpgrade: 0,
    armorUpgrade: 0
  },
  {
    damageUpgrade: 0,
    shieldUpgrade: 0,
    armorUpgrade: 10
  },
  {
    damageUpgrade: 0,
    shieldUpgrade: 10,
    armorUpgrade: 0
  },
  {
    damageUpgrade: 10,
    shieldUpgrade: 0,
    armorUpgrade: 0
  }
];

/**
 * Calculates the cost of a specified number of upgrades.
 *
 * @param numUpgrades The number of upgrades.
 */
function calculateUpgradeCost(numUpgrades: number): number {
  let currentUpgradeCost = 20;
  let cost = 0;
  for (let i = 1; i <= numUpgrades; i += 1) {
    cost += currentUpgradeCost;
    currentUpgradeCost += 20;
  }
  return cost;
}

let totalCost = 0;
researchTowers.forEach((tower) => {
  totalCost += calculateUpgradeCost(tower.armorUpgrade);
  totalCost += calculateUpgradeCost(tower.shieldUpgrade);
  totalCost += calculateUpgradeCost(tower.damageUpgrade);
});

/**
 * Determines if a point is obtained based on a percentage.
 *
 * @param percentage The percentage to check.
 */
function getsPoint(percentage: number) {
  const randomNumber = Math.random();
  return randomNumber <= percentage;
}

/**
 * Calculates and logs probabilities related to research towers.
 */
export default function calculateProbabilities(): void {
  const numberOfRounds = 100;
  let numDamageIncrease = 0;
  let numArmorIncrease = 0;
  let numshieldIncrease = 0;
  for (let i = 0; i < numberOfRounds; i += 1) {
    researchTowers.forEach((tower) => {
      if (getsPoint(tower.armorUpgrade / 100)) {
        numArmorIncrease += 1;
      }
      if (getsPoint(tower.shieldUpgrade / 100)) {
        numshieldIncrease += 1;
      }
      if (getsPoint(tower.damageUpgrade / 100)) {
        numDamageIncrease += 1;
      }
    });
  }

  console.table({
    Rounds: numberOfRounds,
    'Total Cost': totalCost,
    'Damage Increase': numDamageIncrease,
    'Armor Increase': numArmorIncrease,
    'Shield Increase': numshieldIncrease
  });
}
