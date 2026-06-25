'use strict';
// CI stub — production module lives only on the factory server
module.exports = {
  getSlotStats: async () => ({ slots: [], total: 0, operator: null, operation: null }),
  getStats:     async () => ({}),
  getPlan:      async () => ([]),
  calculate:    async () => ({})
};
