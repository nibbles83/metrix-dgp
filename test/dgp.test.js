
const expect = require('chai').expect;
const Big = require('big.js');
const helpers = require('./helpers');

let qtum, dgpContract;


// compile and deploy contract before tests
before(async () => {
    await helpers.deploy(['gasSchedule-dgp.sol', 'blockSize-dgp.sol', 'minGasPrice-dgp.sol', 'blockGasLimit-dgp.sol', 'governanceCollateral-dgp.sol', 'budgetFee-dgp.sol', 'DGP.sol']);
    qtum = helpers.qtum();
    dgpContract = qtum.contract('DGP.sol');
})

describe('DGP.sol', function () {
    it('Should return gas schedule from dgp contract', async function () {
        const result = await dgpContract.call("getSchedule");
        const _gasSchedule = [
            10, 10, 10, 10, 10, 10, 10, 10, 10, 50, 30, 6, 200, 20000, 5000, 15000, 1, 375, 8, 375, 32000, 700, 2300, 9000, 25000, 24000, 3, 512, 200, 21000, 53000, 4, 68, 3, 700, 700, 400, 5000, 24576
        ];
        for (let i = 0; i < _gasSchedule.length; i++) {
            const value = result.outputs[0][i].toNumber();
            expect(value).to.equal(_gasSchedule[i]);
        }
    });

    it('Should return block size from dgp contract', async function () {
        const result = await dgpContract.call("getBlockSize");
        const value = result.outputs[0][0].toNumber();
        expect(value).to.equal(2000000);
    });

    it('Should return min gas price from dgp contract', async function () {
        const result = await dgpContract.call("getMinGasPrice");
        const value = result.outputs[0][0].toNumber();
        expect(value).to.equal(1);
    });

    it('Should return block gas limit from dgp contract', async function () {
        const result = await dgpContract.call("getBlockGasLimit");
        const value = result.outputs[0][0].toNumber();
        expect(value).to.equal(40000000);
    });

    it('Should return governance collateral from dgp contract', async function () {
        const result = await dgpContract.call("getGovernanceCollateral");
        const value = result.outputs[0][0].toNumber();
        expect(value).to.equal(10E8);
    });

    it('Should return budget fee from dgp contract', async function () {
        const result = await dgpContract.call("getBudgetFee");
        const value = result.outputs[0][0].toNumber();
        expect(value).to.equal(1E8);
    });
});
