export default class PriorityQueue {
  constructor(max_length) {
    this.error = new Float32Array(max_length);
    this.data = new Int32Array(max_length);
    this.size = 0;
  }

  push(data, error) {
    this.data[this.size] = data;
    this.error[this.size] = error;
    this.bubbleUp(this.size);
    this.size++;
  }

  pop() {
    const result = this.data[0];
    this.size--;
    if (this.size > 0) {
      this.data[0] = this.data[this.size];
      this.error[0] = this.error[this.size];
      this.sinkDown(0);
    }
    return result;
  }

  bubbleUp(n) {
    const data = this.data[n];
    const error = this.error[n];
    while (n > 0) {
      const pN = ((n + 1) >> 1) - 1;
      const pError = this.error[pN];
      if (pError > error) break;

      this.data[n] = this.data[pN];
      this.error[n] = pError;
      this.data[pN] = data;
      this.error[pN] = error;
      n = pN;
    }
  }

  sinkDown(n) {
    const data = this.data[n];
    const error = this.error[n];

    while (true) {
      const child2N = (n + 1) * 2;
      const child1N = child2N - 1;
      let swap = -1;
      let child1Error;
      if (child1N < this.size) {
        child1Error = this.error[child1N];
        if (child1Error > error) swap = child1N;
      }
      if (child2N < this.size) {
        const child2Error = this.error[child2N];
        if (child2Error > (swap === -1 ? error : child1Error)) swap = child2N;
      }

      if (swap === -1) break;

      this.data[n] = this.data[swap];
      this.error[n] = this.error[swap];
      this.data[swap] = data;
      this.error[swap] = error;
      n = swap;
    }
  }
}
