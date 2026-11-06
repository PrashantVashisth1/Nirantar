import type { Locale } from '@nirantar/shared';

/**
 * What the customer is told about an order, in their language (A10: Bengali,
 * Hindi and English). Only facts and next steps; never dosing or medical advice.
 */
export type OrderMessage = Record<Locale, string>;

export const orderMessages = {
  approved: (n: string): OrderMessage => ({
    en: `Your pharmacist approved order ${n}.`,
    hi: `फ़ार्मासिस्ट ने ऑर्डर ${n} मंज़ूर कर दिया है।`,
    bn: `ফার্মাসিস্ট অর্ডার ${n} অনুমোদন করেছেন।`,
  }),
  changes: (n: string): OrderMessage => ({
    en: `Your pharmacist checked order ${n} and suggested changes. Please open the app to confirm.`,
    hi: `फ़ार्मासिस्ट ने ऑर्डर ${n} जाँचकर कुछ बदलाव सुझाए हैं। पुष्टि के लिए कृपया ऐप खोलें।`,
    bn: `ফার্মাসিস্ট অর্ডার ${n} যাচাই করে কিছু পরিবর্তনের কথা বলেছেন। নিশ্চিত করতে অ্যাপ খুলুন।`,
  }),
  rejected: (n: string): OrderMessage => ({
    en: `Order ${n} couldn't be approved. Please open the app to see why and what to do next.`,
    hi: `ऑर्डर ${n} मंज़ूर नहीं हो सका। कारण और आगे क्या करना है, यह जानने के लिए कृपया ऐप खोलें।`,
    bn: `অর্ডার ${n} অনুমোদন করা যায়নি। কারণ ও পরবর্তী ধাপ জানতে অ্যাপ খুলুন।`,
  }),
  reupload: (n: string): OrderMessage => ({
    en: `We need a clearer photo of your prescription for order ${n}. Please open the app to upload it again.`,
    hi: `ऑर्डर ${n} के लिए हमें आपके पर्चे की साफ़ फ़ोटो चाहिए। दोबारा अपलोड करने के लिए कृपया ऐप खोलें।`,
    bn: `অর্ডার ${n}-এর জন্য আপনার প্রেসক্রিপশনের একটি পরিষ্কার ছবি দরকার। আবার আপলোড করতে অ্যাপ খুলুন।`,
  }),
  onTheWay: (n: string, rider: string): OrderMessage => ({
    en: `Order ${n} is on the way with ${rider}.`,
    hi: `ऑर्डर ${n} ${rider} के साथ रास्ते में है।`,
    bn: `অর্ডার ${n} ${rider}-এর সঙ্গে পথে আছে।`,
  }),
  delivered: (n: string): OrderMessage => ({
    en: `Order ${n} has been delivered.`,
    hi: `ऑर्डर ${n} पहुँच गया है।`,
    bn: `অর্ডার ${n} পৌঁছে গেছে।`,
  }),
  paid: (n: string): OrderMessage => ({
    en: `Payment received for order ${n}. Thank you.`,
    hi: `ऑर्डर ${n} का भुगतान मिल गया। धन्यवाद।`,
    bn: `অর্ডার ${n}-এর পেমেন্ট পাওয়া গেছে। ধন্যবাদ।`,
  }),
  paymentFailed: (n: string): OrderMessage => ({
    en: `The UPI payment for order ${n} didn't go through. You can try again or pay cash on delivery.`,
    hi: `ऑर्डर ${n} का UPI भुगतान नहीं हो पाया। आप फिर कोशिश कर सकते हैं या डिलीवरी पर नकद दे सकते हैं।`,
    bn: `অর্ডার ${n}-এর UPI পেমেন্ট হয়নি। আবার চেষ্টা করতে পারেন বা ক্যাশ অন ডেলিভারি বেছে নিতে পারেন।`,
  }),
};
