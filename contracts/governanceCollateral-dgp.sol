pragma solidity 0.5.8;

contract governanceCollateral {
    uint256[1] _governanceCollateral = [
        10E8 // collateral required for governors
    ];
    function getGovernanceCollateral() public view returns (uint256[1] memory) {
        return _governanceCollateral;
    }
}
