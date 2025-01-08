// test_unordered.cpp
#include <unordered_set>
#include <iostream>

int main() {
    std::unordered_set<int> numbers;
    numbers.insert(42);
    std::cout << "First element: " << *numbers.begin() << std::endl;
    return 0;
}

