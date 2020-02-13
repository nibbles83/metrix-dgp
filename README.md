The Metrix Decentralised Governance Protocol contracts and test suite.

# Install

Clone the repository
```
git clone https://github.com/TheLindaProjectInc/metrix-dgp.git
```
Install required pacakges
```
npm install
```
Download Qtum client from https://github.com/qtumproject/qtum/releases and setup a qtum.conf file
```
rpcuser=user
rpcpassword=pass
txindex=1
logevents=1
```
run qtum in regtest mode
```
qtumd -regtest
```
If it is your first time running the regtest chain you will need to generate a number of blocks to fund your account. This can take some time.

Frist generate an address to fund
```
qtum-cli -regtest getnewaddress
```
the generate 1200 blocks to that address
```
qtum-cli -regtest generatetoaddress 1200 "YOURADDRESS"
```
finally make sure you account has a mature balance
```
qtum-cli -regtest getbalance
```
if your balance is 0 generate 600 some more blocks

# Running The Tests
Launch the project with the play button in VS Code or run `npm test` from the console inside the project.

Each time the tests are run the contracts will be compiled and deployed so their state will reset between each test.
