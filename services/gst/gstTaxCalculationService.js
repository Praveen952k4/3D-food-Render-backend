/**
 * Fixed-precision calculation service for Indian GST
 * Avoids binary floating-point representation bugs by working in integer paise (cents)
 */
class GSTTaxCalculationService {
  /**
   * Round to 2 decimal places using half-up rule
   */
  static round2(num) {
    return Number(Math.round(num + 'e2') + 'e-2');
  }

  /**
   * Convert Rupees to Paise
   */
  static toPaise(rupees) {
    return Math.round((Number(rupees) || 0) * 100);
  }

  /**
   * Convert Paise to Rupees
   */
  static toRupees(paise) {
    return Number((paise / 100).toFixed(2));
  }

  /**
   * Compute tax components on a taxable value
   * @param {number} taxableValue - in Rupees
   * @param {Object} options
   * @param {number} options.ratePercent - Total GST rate (e.g. 5.0)
   * @param {boolean} options.isInterstate - true if IGST, false if CGST + SGST
   */
  static calculateTax(taxableValue, { ratePercent = 5.0, isInterstate = false } = {}) {
    const taxablePaise = this.toPaise(taxableValue);
    
    if (isInterstate) {
      const igstPaise = Math.round((taxablePaise * ratePercent) / 100);
      const totalTaxPaise = igstPaise;
      const invoiceTotalPaise = taxablePaise + totalTaxPaise;

      return {
        taxableValue: this.toRupees(taxablePaise),
        ratePercent,
        isInterstate: true,
        cgstRate: 0,
        cgst: 0,
        sgstRate: 0,
        sgst: 0,
        igstRate: ratePercent,
        igst: this.toRupees(igstPaise),
        totalTax: this.toRupees(totalTaxPaise),
        invoiceTotal: this.toRupees(invoiceTotalPaise),
      };
    } else {
      const halfRate = ratePercent / 2;
      const cgstPaise = Math.round((taxablePaise * halfRate) / 100);
      const sgstPaise = Math.round((taxablePaise * halfRate) / 100);
      const totalTaxPaise = cgstPaise + sgstPaise;
      const invoiceTotalPaise = taxablePaise + totalTaxPaise;

      return {
        taxableValue: this.toRupees(taxablePaise),
        ratePercent,
        isInterstate: false,
        cgstRate: halfRate,
        cgst: this.toRupees(cgstPaise),
        sgstRate: halfRate,
        sgst: this.toRupees(sgstPaise),
        igstRate: 0,
        igst: 0,
        totalTax: this.toRupees(totalTaxPaise),
        invoiceTotal: this.toRupees(invoiceTotalPaise),
      };
    }
  }

  /**
   * Reverse-calculate taxable amount and tax from a tax-inclusive total
   */
  static extractTaxFromTotal(inclusiveTotal, { ratePercent = 5.0, isInterstate = false } = {}) {
    const totalPaise = this.toPaise(inclusiveTotal);
    const taxablePaise = Math.round((totalPaise * 100) / (100 + ratePercent));
    const totalTaxPaise = totalPaise - taxablePaise;

    if (isInterstate) {
      return {
        taxableValue: this.toRupees(taxablePaise),
        cgst: 0,
        sgst: 0,
        igst: this.toRupees(totalTaxPaise),
        totalTax: this.toRupees(totalTaxPaise),
        invoiceTotal: this.toRupees(totalPaise),
      };
    } else {
      const halfTaxPaise = Math.round(totalTaxPaise / 2);
      const otherHalfTaxPaise = totalTaxPaise - halfTaxPaise;

      return {
        taxableValue: this.toRupees(taxablePaise),
        cgst: this.toRupees(halfTaxPaise),
        sgst: this.toRupees(otherHalfTaxPaise),
        igst: 0,
        totalTax: this.toRupees(totalTaxPaise),
        invoiceTotal: this.toRupees(totalPaise),
      };
    }
  }
}

module.exports = GSTTaxCalculationService;
