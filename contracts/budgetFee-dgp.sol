pragma solidity 0.5.8;

contract budgetFee {
    uint256[1] _budgetFee = [
        2000E8 // fee required to submit budget proposal
    ];
    function getBudgetFee() public view returns (uint256[1] memory) {
        return _budgetFee;
    }
}
