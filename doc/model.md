# Model — Radioactivity and Measurements

The physics this simulation is about, and the choices behind how it is computed.

## What is being measured

A radioactive source decays at random. Each nucleus decays independently, and
over any span short compared with the half-life the average rate is constant.
Those two facts — independence and a constant mean rate — are the definition of
a **Poisson process**, and they are the whole content of the sim.

The measurement is deliberately primitive: point a detector at a source, count
how many decays register in a fixed interval, write the number down, repeat.
Every number in the sim comes from that one operation.

## The consequence students are meant to meet

Repeat the measurement on a source that is not changing and the answers still
differ — 18, 23, 19, 26, 17. Nothing about the source or the detector varied.
The scatter is not experimental sloppiness; it is the physics.

If the number of decays in an interval is Poisson with mean λ, then

$$P(k;\lambda) = \frac{e^{-\lambda}\lambda^{k}}{k!}$$

and the distribution's variance **equals** its mean:

$$\sigma = \sqrt{\lambda}$$

This is the sim's central claim and it is falsifiable on screen: collect a run,
read off the measured standard deviation *s*, and compare it with √mean. The
statistics panel places those two rows adjacent for exactly that reason.

## Two spreads, which are not the same thing

The most common confusion in counting experiments, so both are reported:

| Quantity | Meaning | Behaviour as N grows |
|---|---|---|
| **s** (standard deviation) | how much a *single* measurement scatters | converges on the true σ; does **not** shrink |
| **s/√N** (standard deviation of the mean) | how precisely the *mean* is known | shrinks as 1/√N |

Taking more data does not make an individual measurement more repeatable. It
makes the *average* better determined. A run of 100 intervals has the same *s*
as a run of 10 and a standard error about three times smaller.

## The Gaussian limit

For large λ the Poisson distribution approaches a Gaussian with the same mean
and σ = √λ. The Lab screen can draw that Gaussian on top of the histogram.

The approximation is not uniformly good, and the sim lets that be seen. At the
peak the two agree to a fraction of a percent even at λ = 100; one standard
deviation out they still differ by about 3%, and the discrepancy falls only as
1/√λ. At the low counting rates a classroom source and a short interval produce,
the Poisson distribution is visibly skewed and the Gaussian is visibly wrong in
the tails. This is why the Poisson curve is shown by default and the Gaussian is
opt-in, and why `tests/common/model/Statistics.test.ts` asserts the convergence
rather than mere agreement.

## The three curves

| Curve | Parameters | Free parameters | What it tests |
|---|---|---|---|
| Poisson | λ = measured mean | none | is the process Poisson at all? |
| Gaussian prediction | μ = mean, σ = √mean | none | is λ large enough for the normal limit? |
| Gaussian fit | A, μ, σ all floated | three | does the fitted σ come out at √mean? |

Only the third is a fit. The first two are predictions with nothing adjusted to
suit the data, which is what makes their agreement (or failure) meaningful.

## Computational choices

**Welford's algorithm** computes mean and variance in one pass. The textbook
Σx² − (Σx)²/N form catastrophically loses precision when the mean is large
relative to the spread — precisely the high-count-rate case.

**Log-space Poisson.** P(k;λ) is evaluated as
exp(−λ + k ln λ − ln k!) with ln k! from a Lanczos log-gamma. At λ = 200 both
λ^k and k! overflow a double long before their ratio does.

**Per-bin summation, not density sampling.** A histogram bin covering several
integer outcomes gets the *sum* of P(k;λ) over the integers it contains.
Sampling a continuous density at the bin centre would be wrong for wide bins and
small λ, where the distribution is skewed.

**Integer bins.** Counts are integers, so bin edges stay on integers and the bin
width is a positive integer. Fractional bins would capture differing numbers of
possible outcomes and produce a spurious comb pattern.

**Bin count, not just bin width.** Freedman–Diaconis (2·IQR·N^(−1/3)) optimises
density estimation, not legibility: on the default 20-sample run it yields about
four bars, which shows no distribution at all. The width is therefore narrowed
until there are at least eight bins, and widened past thirty.

**Poisson-weighted fitting.** The Gaussian fit minimises χ² with each bin
weighted by 1/nᵢ, since a bin holding nᵢ measurements is known to ±√nᵢ. Empty
bins are floored at 1. Unweighted fitting would let the tall central bins
dominate and would systematically underestimate σ.

**Reduced χ².** χ² per degree of freedom (bins − 3) is reported. Near 1 means
the model describes the data about as well as the counting noise allows; much
above 1 means it does not; much below 1 usually means the bins are too wide.

## The simulated source

The simulated source draws the number of events in an interval directly from a
Poisson distribution with mean = activity × dt, rather than simulating individual
decays. That is exact — the count in a window of a Poisson process is itself
Poisson — and makes the result independent of frame rate. Knuth's product
algorithm is used below λ = 30 and a rounded Gaussian above it, where the two are
indistinguishable.

The simulated source matters pedagogically, not just as a fallback: it is the
only source whose true λ is known, so it is the only place the σ = √λ prediction
can be checked against an answer known in advance.

## Timing

The counting cycle runs continuously, whether or not the sim is recording,
exactly as a bench counter does. Recording only decides whether completed
intervals are kept.

Each interval's remainder is carried forward rather than zeroed, so intervals do
not drift against the frame rate over a long run. A very large `dt` — what a
backgrounded browser tab hands back on return — is clamped, because that elapsed
wall time was never actually observed and must not become fabricated
measurements.

## Hardware

See [`implementation-notes.md`](implementation-notes.md) for the PASCO Bluetooth
protocol and the one genuinely open question in it: how the counter's
`CountRate` register behaves under polling.
