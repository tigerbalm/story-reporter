class MomentUtil {
    static valid(date) {
        return date && date.isValid();
    }
    
    static min(a, b) {
        return a.isBefore(b) ? a : b;
    }
    
    static max(a, b) {
        return a.isAfter(b) ? a : b;
    }
}

export default MomentUtil;