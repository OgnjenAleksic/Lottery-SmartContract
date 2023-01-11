const {
  developmentChains,
  networkConfig,
} = require("../helper-hardhat-config");
const { network } = require("hardhat");

const GAS_FEE = "250000000000000000"; //0.25 link per request (Premium)
const GAS_PRICE_LINK = 1e9; //calculated value based on ghe gas price of the chain

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  if (chainId == 31337) {
    log("Local network detected, deploying mocks");
    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: [GAS_FEE, GAS_PRICE_LINK],
    });
    log("Mocks deployed");
    log("------------------------------------------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];
