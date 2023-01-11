const { inputToConfig } = require("@ethereum-waffle/compiler");
const { assert, expect } = require("chai");
const { ethers, getNamedAccounts, deployments, network } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery", function () {
      let lottery, vrfCoordinatorV2Mock, deployer, entranceFee, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        lottery = await ethers.getContract("Lottery", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        entranceFee = await lottery.getEntranceFee();
        interval = await lottery.getInterval();
      });

      describe("Constructor", async () => {
        it("Initializes the lottery correctly", async () => {
          const lotteryState = await lottery.getLotteryState();
          const interval = await lottery.getInterval();
          assert.equal(lotteryState.toString(), "0");
          assert.equal(networkConfig[chainId]["interval"], interval.toString());
        });
      });
      describe("Enter Lottery", function () {
        it("Reverts if you dont pay enough", async () => {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery__NotEnoughETHEntered"
          );
        });
        it("Records players when they enter the lottery", async () => {
          await lottery.enterLottery({ value: entranceFee });
          const player = await lottery.getPlayer(0);
          assert.equal(player, deployer);
        });
        it("Emits an event when new player applies", async () => {
          await expect(lottery.enterLottery({ value: entranceFee })).to.emit(
            lottery,
            "LotteryEnter"
          );
        });
        it("Doesn't allow entrance if Lottery state is Calculating", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep("0x");

          await expect(
            lottery.enterLottery({ value: entranceFee })
          ).to.be.revertedWith("Lottery__Closed()");
        });
      });
      describe("CheckUpkeep", function () {
        it("Returns false if there is no players or ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("Returns false if not enough time has passed", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() - 5,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.checkUpkeep("0x");
          assert(!upkeepNeeded);
        });
        it("Returns false if Lottery state is Calculating", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep("0x");
          const lotteryState = await lottery.getLotteryState();
          const { upkeepNeeded } = await lottery.checkUpkeep("0x");
          assert.equal(lotteryState.toString(), "1");
          assert(!upkeepNeeded);
        });
        it("Returns true if there is ETH, players, set interval has passed and Lottery state is Open", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 5,
          ]);
          await network.provider.send("evm_mine", []);
          const { upkeepNeeded } = await lottery.checkUpkeep("0x");
          assert(upkeepNeeded);
        });
      });
      describe("PerformUpkeep", function () {
        it("Runs only if checkUpkeep is true", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 5,
          ]);
          await network.provider.send("evm_mine", []);
          const performUpkeep = await lottery.performUpkeep("0x");
          assert(performUpkeep);
        });
        it("Reverts if checkUpkeep is false", async () => {
          await expect(lottery.performUpkeep("0x")).to.be.revertedWith(
            "Lottery__UpkeepNotNeeded"
          );
        });
        it("Changes Lottery state to Calculating", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 5,
          ]);
          await network.provider.send("evm_mine", []);
          const performUpkeep = await lottery.performUpkeep("0x");
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "1");
        });
        it("Calls the VRFCoordinator", async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 5,
          ]);
          await network.provider.send("evm_mine", []);
          const txResponse = await lottery.performUpkeep("0x");
          const txReceipt = await txResponse.wait(1);
          const requestId = txReceipt.events[1].args.requestId;
          assert(requestId.toNumber() > 0);
        });
      });
      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          await lottery.enterLottery({ value: entranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 5,
          ]);
          await network.provider.send("evm_mine", []);
        });
        it("Can only be called after performUpkeep", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request");
        });
        it("Picks the winner, resets the lottery and sends money", async () => {
          const additionalEntrants = 3;
          const startingIndex = 1;
          const accounts = await ethers.getSigners();
          for (
            let i = startingIndex;
            i < startingIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedLottery = lottery.connect(accounts[i]);
            await accountConnectedLottery.enterLottery({ value: entranceFee });
          }
          const startingTimestamp = await lottery.getLatestTimestamp();
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              try {
                const recentWinner = await lottery.getRecentWinner();
                console.log(recentWinner);
                console.log(accounts[0].address);
                console.log(accounts[1].address);
                console.log(accounts[2].address);
                console.log(accounts[3].address);
                const winnerEndingBalance = await accounts[1].getBalance();
                const lotteryState = await lottery.getLotteryState();
                const endingTimeStamp = await lottery.getLatestTimestamp();
                const numPlayers = await lottery.getNumberOfPlayers();
                assert.equal(numPlayers.toString(), "0");
                assert.equal(lotteryState.toString(), "0");
                assert.equal(recentWinner.toString(), accounts[1].address);
                assert(endingTimeStamp > startingTimestamp);
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    entranceFee
                      .mul(additionalEntrants)
                      .add(entranceFee)
                      .toString()
                  )
                );
              } catch (e) {
                reject(e);
              }
              resolve();
            });
            const tx = await lottery.performUpkeep("0x");
            const txReceipt = await tx.wait(1);
            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              lottery.address
            );
          });
        });
      });
    });
