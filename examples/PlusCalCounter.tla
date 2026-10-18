--------------------------- MODULE PlusCalCounter ---------------------------
EXTENDS Naturals

CONSTANT Max
ASSUME Max \in Nat

\* PlusCal p-syntax. Translate with the official PlusCal tools before running TLC.
(* --algorithm Counter
variables count = 0;
begin
    Count:
        while count < Max do
            count := count + 1;
        end while;
    DoneCounting:
        assert count = Max;
end algorithm; *)

=============================================================================
