const { inputToConfig } = require("@ethereum-waffle/compiler");
const { assert, expect, util } = require("chai");
const { ethers, getNamedAccounts, deployments, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../../helper-hardhat-config");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      let lottery, deployer, entranceFee;
      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        lottery = await ethers.getContract("Lottery", deployer);
        entranceFee = await lottery.getEntranceFee();
      });

      describe("fulfillRandomWords", function () {
        it("Works with live chainlink Automation and VRF, getting a random winner", async () => {
          const startingTimestamp = await lottery.getLatestTimeStamp();
          const accounts = await ethers.getSigners();
          await new Promise(async (resolve, reject) => {
            console.log("WinnerPicked event fired!");
            try {
              const recentWinner = await lottery.getRecentWinner();
              const lotteryState = await lottery.getLotteryState();
              const winnerEndingBalance = await accounts[0].getBalance();
              const endingTimeStamp = await lottery.getLatestTimestamp();

              await expect(lottery.getPlayer(0)).to.be.reverted();
              assert.equal(recentWinner.toString(), accounts[0].address);
              assert.equal(lotteryState.toString(), "0");
              assert.equal(
                winnerEndingBalance,
                toString(),
                winnerStartingBalance.add(entranceFee).toString()
              );
              assert(endingTimeStamp > startingTimestamp);
              resolve();
            } catch (error) {
              console.error(error);
              reject(e);
            }
          });
          await lottery.enterLottery({ value: entranceFee });
          const winnerStartingBalance = await accounts[0].getBalance();
        });
      });
    });
