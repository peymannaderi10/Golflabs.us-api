"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentService = exports.DocumentService = exports.SYSTEM_DEFAULTS = void 0;
const crypto_1 = require("crypto");
const database_1 = require("../../config/database");
const logger_1 = require("../../shared/utils/logger");
const document_types_1 = require("./document.types");
exports.SYSTEM_DEFAULTS = {
    terms_of_service: `TERMS OF SERVICE

Last Updated: February 2026

Welcome to GolfLabs. These Terms of Service ("Terms") govern your access to and use of the GolfLabs facilities, website, booking platform, and related services (collectively, the "Services"). By accessing or using our Services, you agree to be bound by these Terms. If you do not agree, do not use the Services.

As used in these Terms, "GolfLabs," "we," "us," and "our" refer to Golf Labs Technologies LLC and its affiliates, subsidiaries, officers, directors, employees, agents, and representatives. "You" and "your" refer to the individual accessing or using the Services.

1. FACILITY USE AND SAFETY

1.1. You agree to use the GolfLabs facility, including all simulator bays, equipment, common areas, and amenities, at your own risk and in accordance with all posted rules, instructions, and staff directives.

1.2. Proper golf etiquette and simulator use are required at all times. All golf shots must be directed solely at designated simulator impact screens. Shots directed at monitors, televisions, walls, or any areas not designed to receive impact are strictly prohibited and may result in immediate termination of your session, permanent banning from the facility, and financial liability for any resulting damages.

1.3. Reckless or dangerous behavior, including but not limited to swinging clubs outside designated areas, jumping on furniture, horseplay, or any unsafe conduct, is prohibited and may result in immediate removal from the facility without refund.

1.4. The facility is self-service and is generally unstaffed. No supervision or emergency personnel are on-site. You are solely responsible for your own safety and the safety of your guests while on the premises. In case of emergency, call 911 immediately.

2. MINORS

2.1. Children under the age of 16 must be accompanied and directly supervised by a parent or legal guardian at all times while on the premises.

2.2. Parents and legal guardians accept full responsibility for any injuries sustained by or damages caused by minors under their supervision.

2.3. The Services are not directed to individuals under the age of 13, and we do not knowingly collect personal information from children under 13.

3. BOOKINGS AND CANCELLATIONS

3.1. Simulator sessions must be booked in advance through our online booking platform.

3.2. When making a booking, a temporary reservation is held for a limited time to allow you to complete payment. If payment is not completed within this window, the reservation will be automatically released.

3.3. Cancellations or rescheduling require at least 24 hours' notice prior to your scheduled session start time to receive a full refund. Late cancellations (less than 24 hours' notice) or no-shows may be charged in full.

3.4. GolfLabs reserves the right to cancel, reschedule, or modify bookings due to maintenance, emergencies, or other operational needs. In such cases, affected customers will be offered a full refund or the option to reschedule.

4. PAYMENTS AND FEES

4.1. All fees are due at the time of booking as specified during the checkout process.

4.2. Payment is processed securely through our third-party payment processor, Stripe. GolfLabs does not store your full credit card information. By providing your payment details, you authorize GolfLabs and its payment processor to charge the applicable fees.

4.3. A valid payment method is required for all bookings, including complimentary or promotional bookings, which may require a card on file for potential session extensions or damages.

4.4. Non-payment, declined payments, or chargebacks may result in suspension or termination of your account and access to the facility.

4.5. Returned or declined payments may incur additional service fees.

5. DAMAGES AND CLEANING FEES

5.1. You are financially responsible for any and all damage caused by you or your guests to GolfLabs equipment, furniture, simulator screens, launch monitors (e.g., Uneekor Eye Mini units), projectors, monitors, computers, walls, flooring, hitting mats, or any other property on the premises. This includes, but is not limited to, damage resulting from misuse, negligence, reckless behavior, improper swing technique, accidental contact, or intentional acts. Launch monitors and sensor units are positioned within the simulator bay area; you are responsible for exercising caution to avoid striking or damaging these devices during use.

5.2. You understand and agree that you will be charged accordingly for any damages or extra cleaning fees as warranted. By providing your payment method during the booking process, you expressly authorize GolfLabs to charge your payment method on file for the cost of repairing or replacing any damaged property, as well as any additional cleaning fees required to restore the facility to its prior condition. GolfLabs will make reasonable efforts to notify you of such charges and provide documentation of the damage.

5.3. Damage charges may include, but are not limited to: replacement cost of simulator impact screens, repair or replacement of launch monitors and sensor units (e.g., Uneekor Eye Mini), repair or replacement of projectors, monitors, and computers, wall and flooring repairs, hitting mat replacement, furniture replacement, and professional cleaning services.

5.4. Broken or unsafe conditions, including torn simulator screens, holes in walls, or damaged furniture, must be reported immediately to GolfLabs. Bays deemed unsafe must not be used until cleared by staff.

5.5. If you witness any individual deliberately attempting to damage or vandalize property, or using an unsafe or damaged bay without reporting it, you agree to notify staff immediately. Failure to report known damage may result in shared liability for additional damages or injuries that occur.

6. CONDUCT POLICY

6.1. GolfLabs is a shared environment. All users and guests are expected to treat others with courtesy, respect, and good sportsmanship at all times.

6.2. Disruptive behavior, excessive noise, harassment, intimidation, offensive language, or interference with another person's play will not be tolerated.

6.3. Bring-your-own-beverage (BYOB) alcohol consumption is permitted for guests aged 21 and older, in moderation only. Intoxicated or disruptive behavior is grounds for immediate removal and potential permanent banning from the facility. GolfLabs does not sell, serve, or provide alcohol, and assumes no liability for alcohol consumed on the premises.

6.4. Smoking, vaping, open flames, and the use of drugs (medicinal or recreational) that may impair judgment or reaction times are strictly prohibited on the premises. Breach of this policy may result in immediate removal, fines, or permanent banning from the facility.

6.5. GolfLabs reserves the right to refuse service, terminate sessions, revoke access, or permanently ban any individual for violations of these Terms or unsafe behavior, with or without refund, at our sole discretion.

7. GUEST RESPONSIBILITY

7.1. You are responsible for the conduct, safety, and actions of all guests you bring to or permit to enter the facility.

7.2. All guests must be disclosed during the booking process. Unregistered guests may result in denial of access or additional fees.

8. CLEANLINESS

8.1. Users must keep the facility clean, dispose of trash properly, return equipment to its designated location, and leave simulator bays in a clean condition.

8.2. Extra cleaning fees may be assessed for bays or common areas left in an unreasonable condition.

9. SECURITY AND SURVEILLANCE

9.1. The facility is under 24/7 video surveillance for safety and security purposes. By entering the facility, you acknowledge and consent to being recorded.

9.2. Surveillance footage may be used for investigations, insurance claims, legal proceedings, security purposes, or to enforce these Terms.

10. ACCOUNT TERMINATION

10.1. GolfLabs may suspend or terminate your account and access to the Services at any time, with or without cause, and with or without notice.

10.2. You may terminate your account by contacting us at the email address provided below.

11. INTELLECTUAL PROPERTY

11.1. All content, trademarks, logos, and intellectual property displayed on the GolfLabs website and Services are the property of GolfLabs or its licensors and may not be reproduced, distributed, or used without prior written consent.

12. DISCLAIMER OF WARRANTIES

12.1. The Services and facilities are provided "as is" and "as available" without any warranties, express or implied. GolfLabs does not guarantee simulator availability, accuracy, or uninterrupted service.

13. LIMITATION OF LIABILITY

13.1. To the maximum extent permitted by law, GolfLabs' total liability to you for any claims arising from or related to your use of the Services or facilities shall not exceed the total amount paid by you for the specific booking giving rise to the claim.

13.2. GolfLabs shall not be liable for any indirect, incidental, special, consequential, or punitive damages.

14. DISPUTE RESOLUTION

14.1. These Terms shall be governed by and construed in accordance with the laws of the State of New Jersey, without regard to its conflict-of-laws principles. Any disputes shall be subject to the exclusive jurisdiction of the courts located in the State of New Jersey.

14.2. Any disputes arising out of or related to these Terms or your use of the Services shall first be submitted to good-faith mediation before legal proceedings may be pursued.

15. AMENDMENTS

15.1. GolfLabs reserves the right to update or modify these Terms at any time. The "Last Updated" date at the top of this document indicates when the Terms were last revised.

15.2. Continued use of the Services after any modifications constitutes acceptance of the revised Terms.

16. CONTACT US

If you have questions or concerns about these Terms of Service, please contact us at:

Email: golflabsllc@gmail.com`,
    privacy_policy: `PRIVACY POLICY

Last Updated: March 2026

At GolfLabs, we respect the privacy rights of our users and recognize the importance of protecting the personal data we collect. This Privacy Policy describes how Golf Labs Technologies LLC ("GolfLabs," "we," "us," and "our") collects, uses, discloses, and protects information when you use our website, booking platform, and related services (collectively, the "Services").

Data Controller: Golf Labs Technologies LLC, golflabsllc@gmail.com

By using our Services, you consent to the practices described in this Privacy Policy.

1. INFORMATION WE COLLECT

1.1. Account Information
When you create an account, we collect your name, email address, phone number, and any other information you provide during registration.
Legal basis: Performance of a contract (providing the Services you signed up for) and legitimate interest (account management).

1.2. Payment Information
When you make a booking, your payment information (credit/debit card details) is collected and processed directly by our third-party payment processor, Stripe, through their secure payment elements. GolfLabs never receives, transmits, or stores your full credit card number, CVV, or other sensitive card data on our servers. Stripe is PCI-DSS compliant and processes your payment information in accordance with their own Privacy Policy (https://stripe.com/privacy).

We may store limited transaction-related information such as the last four digits of your card, card brand, transaction amounts, and payment status for record-keeping and customer service purposes.
Legal basis: Performance of a contract and legal obligation (financial record-keeping).

1.3. Booking Information
We collect information related to your bookings, including dates, times, bay selections, session duration, party size, and pricing details.
Legal basis: Performance of a contract.

1.4. Technical and Usage Information
We automatically collect certain information when you interact with our Services, including:
- IP address
- Browser type and version
- Operating system
- Pages viewed and features used
- Date and time of access
- Referring website or source
Legal basis: Legitimate interest (security, service improvement, and fraud prevention).

1.5. Agreement and Consent Records
When you accept our Terms of Service, Privacy Policy, or Liability Waiver during the booking process, we record the type of agreement, the version accepted, the date and time of acceptance, your IP address, and your browser user agent for legal compliance and audit purposes.
Legal basis: Legal obligation and legitimate interest.

1.6. Communications
If you contact us via email or through our Services, we may retain the content of your communications along with your contact information and our responses.
Legal basis: Legitimate interest.

1.7. Marketing Preferences
If you opt in to receive marketing communications during signup, we record your consent with a timestamp. You may withdraw consent at any time.
Legal basis: Consent.

2. HOW WE USE YOUR INFORMATION

We use the information we collect for the following purposes:

2.1. To provide, maintain, and improve the Services, including processing bookings and payments.

2.2. To verify your identity and authenticate your account.

2.3. To communicate with you about your bookings, including confirmations, reminders, cancellation notices, and receipts.

2.4. To process payments and manage billing.

2.5. To enforce our Terms of Service and protect against unauthorized use or abuse of the Services.

2.6. To comply with legal obligations and respond to lawful requests.

2.7. To analyze usage trends and improve the user experience.

2.8. To send you important service-related notices, such as policy changes or security alerts.

2.9. To send you marketing communications, but only if you have explicitly opted in (you may opt out at any time).

3. SHARING YOUR INFORMATION

We do not sell, trade, or rent your personal information to third parties. We may share your information with the following data processors:

3.1. Stripe (Payment Processing): We share necessary payment and transaction information with Stripe, Inc. to process transactions. Stripe acts as an independent data controller for payment data. See https://stripe.com/privacy.

3.2. Resend (Email Communications): We share email addresses and names with Resend, Inc. to send booking confirmations, reminders, and marketing emails (with your consent). See https://resend.com/legal/privacy-policy.

3.3. Supabase (Database and Authentication): Your account and booking data is stored on infrastructure provided by Supabase, Inc. See https://supabase.com/privacy.

3.4. Render (Hosting): Our API and application are hosted on Render, Inc. infrastructure. See https://render.com/privacy.

3.5. NumVerify (Phone Validation): During signup, your phone number is validated through the NumVerify API (apilayer). See https://apilayer.com/privacy.

3.6. Legal Requirements: We may disclose your information if required by law, regulation, legal process, or governmental request, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.

3.7. Business Transfers: In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction.

4. INTERNATIONAL DATA TRANSFERS

4.1. Our Services are hosted in the United States. If you access our Services from outside the United States, including from the European Economic Area (EEA), your personal data will be transferred to and processed in the United States.

4.2. Our third-party processors (Stripe, Resend, Supabase, Render) are based in the United States. These transfers are protected by appropriate safeguards, including Standard Contractual Clauses (SCCs) where applicable, and participation in the EU-US Data Privacy Framework where certified.

4.3. By using our Services, you acknowledge and consent to the transfer and processing of your data in the United States.

5. DATA RETENTION

5.1. Account information is retained for as long as your account is active or as needed to provide the Services. You may request deletion of your account at any time.

5.2. Booking records are retained for up to seven (7) years for financial, legal, and audit purposes, after which they are anonymized.

5.3. Agreement acceptance records are retained indefinitely for legal compliance purposes (PII is redacted upon account deletion).

5.4. Access logs and technical data are automatically deleted after ninety (90) days.

5.5. Payment records are retained in accordance with applicable tax and financial regulations.

5.6. Marketing preference records are deleted upon account deletion or upon request.

6. DATA SECURITY

6.1. We implement industry-standard security measures to protect your personal data, including encryption in transit (TLS/SSL), secure authentication, role-based access controls, rate limiting, input validation, structured logging with PII redaction, and cryptographically signed tokens.

6.2. Payment data is handled exclusively by Stripe, which maintains PCI-DSS Level 1 compliance.

6.3. While we strive to protect your personal data, no method of transmission over the Internet or electronic storage is completely secure. We cannot guarantee absolute security.

6.4. You are responsible for maintaining the security of your account credentials. Do not share your password or login information with others.

7. COOKIES AND TRACKING

7.1. We use a cookie consent banner. Only strictly necessary cookies are set by default. Functional cookies (e.g., sidebar preferences) require your explicit consent.

7.2. You can change your cookie preferences at any time through the consent banner or your browser settings.

7.3. We do not use third-party analytics or advertising trackers.

8. YOUR RIGHTS

Depending on your location, you may have the following rights regarding your personal data:

8.1. Right of Access: You may request a copy of all personal data we hold about you. You can download your data at any time from your account dashboard.

8.2. Right to Rectification: You may access and update your personal information at any time through your account profile settings.

8.3. Right to Erasure ("Right to Be Forgotten"): You may request deletion of your account and personal data. Upon deletion, we will erase your profile, anonymize your booking and access log records, redact PII from agreement records, delete your marketing data, and delete your Stripe customer record. Certain anonymized data may be retained where required by law.

8.4. Right to Data Portability: You may download a copy of your personal data in JSON format from your account dashboard at any time.

8.5. Right to Restrict Processing: You may request that we restrict the processing of your personal data under certain circumstances.

8.6. Right to Object: You may object to processing based on our legitimate interests.

8.7. Right to Withdraw Consent: Where processing is based on consent (e.g., marketing), you may withdraw consent at any time by unsubscribing or contacting us. Withdrawal does not affect the lawfulness of processing prior to withdrawal.

8.8. Right to Lodge a Complaint: If you are in the EEA, you have the right to lodge a complaint with your local Data Protection Authority.

8.9. No Automated Decision-Making: We do not use your personal data for automated decision-making or profiling that produces legal effects.

To exercise any of these rights, contact us at golflabsllc@gmail.com.

9. THIRD-PARTY LINKS

9.1. The Services may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies.

10. CHILDREN'S PRIVACY

10.1. The Services are not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected information from a child under 13, we will take steps to delete it.

11. CHANGES TO THIS PRIVACY POLICY

11.1. We may update this Privacy Policy from time to time. The "Last Updated" date at the top indicates when the policy was last revised. We will notify you of material changes via email or a notice on our Services. Continued use of the Services after changes constitutes acceptance of the revised policy.

12. CONTACT US

If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:

Golf Labs Technologies LLC
Email: golflabsllc@gmail.com`,
    liability_waiver: `RELEASE AND WAIVER OF LIABILITY

Last Updated: February 2026

PLEASE READ THIS RELEASE AND WAIVER OF LIABILITY ("WAIVER") CAREFULLY BEFORE USING THE GOLFLABS FACILITY. BY ACCEPTING THIS WAIVER, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY ALL OF ITS TERMS.

In consideration of being permitted to enter the GolfLabs facility and participate in golf simulator activities and use of the amenities provided by Golf Labs Technologies LLC (including any subsidiaries, affiliates, or related entities, and applicable to all locations operated by Golf Labs Technologies LLC or its subsidiaries), I agree to this Release and Waiver of Liability, on my behalf and on behalf of all individuals whom I permit to enter the facility and to use the facilities and equipment, which shall include but not be limited to the use of all facilities, including, without limitation, parking areas, entrances, buildings, simulator bays, walkways, hallways, restrooms, common areas, and offices, and the rental and use of all equipment on the premises (hereinafter collectively referred to as the "Facilities and Equipment").

1. ACKNOWLEDGMENT OF RISKS

I acknowledge that participation in golf simulator activities and use of the Facilities and Equipment involves inherent risks, including but not limited to:

(a) Being struck by or coming into contact with golf balls, golf clubs, or other equipment;
(b) Overexertion, muscle strains, repetitive motion injuries, or other physical injuries;
(c) Exacerbation of pre-existing medical conditions;
(d) Slipping, tripping, or falling on the premises;
(e) Exposure to communicable diseases, including but not limited to COVID-19 or other viruses and bacteria;
(f) Injury resulting from equipment malfunction or failure;
(g) Emotional or psychological stress;
(h) Actions of third parties, including other patrons, guests, contractors, or unknown individuals, which may include but are not limited to verbal harassment, intimidation, or physical altercation.

I understand and agree that GolfLabs cannot control the actions of others and shall not be held liable for harm caused by third parties.

2. VOLUNTARY ASSUMPTION OF RISK

I AM VOLUNTARILY PARTICIPATING IN ACTIVITIES AT THE GOLFLABS FACILITY AND I AM PARTICIPATING ENTIRELY AT MY OWN RISK. I AM AWARE OF THE RISKS ASSOCIATED WITH PARTICIPATING IN THESE ACTIVITIES, WHICH MAY INCLUDE, BUT ARE NOT LIMITED TO: PHYSICAL INJURY, PAIN OR SUFFERING, ILLNESS, DISFIGUREMENT, TEMPORARY OR PERMANENT DISABILITY, ECONOMIC OR EMOTIONAL LOSS, DAMAGE TO PROPERTY, OR DEATH. I UNDERSTAND THAT THESE INJURIES OR OUTCOMES MAY ARISE FROM MY OWN OR OTHERS' ACTIONS OR INACTIONS, CONDITIONS RELATED TO THE NATURE OF THE ACTIVITY, THIRD-PARTY ACTIONS, OR ENVIRONMENTAL CONDITIONS. I FREELY AND VOLUNTARILY ASSUME ALL SUCH RISKS, BOTH FORESEEN AND UNFORESEEN.

3. RELEASE AND WAIVER

I hereby, for myself, my heirs, executors, administrators, assigns, and personal representatives (collectively, the "Releasors"), knowingly and voluntarily release and forever discharge Golf Labs Technologies LLC, its owners, officers, directors, managers, members, employees, agents, staff, contractors, affiliates, successors, and assigns (collectively, the "Releasees") from any and all claims, demands, causes of action, suits, or liabilities of any kind whatsoever, whether known or unknown, arising from or related to my participation in activities at the GolfLabs facility, including but not limited to claims based on negligence, breach of contract, breach of duty of care, or any other legal theory.

4. INDEMNIFICATION

I agree to indemnify, defend, and hold harmless the Releasees against any and all claims, suits, actions, liabilities, damages, compensation, costs, and expenses (including reasonable attorneys' fees) brought by me or anyone on my behalf, arising from or related to my use of the Facilities and Equipment or my participation in activities at the GolfLabs facility.

5. EQUIPMENT AND PROPERTY DAMAGE

5.1. I ACKNOWLEDGE AND AGREE that GolfLabs shall not be liable for loss, theft, disappearance, misplacement, or damage to any of my personal property, including but not limited to golf clubs, golf bags, accessories, clothing, electronic devices, or vehicles, whether such items are located in a simulator bay, common area, storage area, parking lot, or any other part of the premises. I am solely responsible for the security and condition of my personal property at all times.

5.2. I ACKNOWLEDGE AND AGREE that GolfLabs shall not be responsible for any damage to my golf clubs or equipment occurring during the use of golf simulators, including but not limited to damage caused by mishits, striking the mat or bay structure, balls rebounding from screens or objects, improper swing mechanics, contact with another person, or any other event arising from or connected to my participation in golf activities on the premises.

5.3. I UNDERSTAND AND AGREE THAT I WILL BE CHARGED ACCORDINGLY FOR ANY DAMAGES OR EXTRA CLEANING FEES AS WARRANTED. This includes damage to all equipment, furniture, simulator screens, launch monitors and sensor units (e.g., Uneekor Eye Mini), projectors, monitors, computers, walls, flooring, hitting mats, and any other GolfLabs property caused by me or by individuals whom I have permitted to enter the facility, whether such damage is intentional or unintentional. I acknowledge that launch monitors and sensor units are positioned within the simulator bay area and that I am responsible for exercising caution to avoid striking or damaging these devices during use. By providing my payment method during the booking process, I expressly authorize GolfLabs to charge my payment method on file for the full cost of repairing or replacing any damaged property, as well as any additional cleaning fees. I understand that damage charges may include, but are not limited to: replacement cost of simulator impact screens, repair or replacement of launch monitors and sensor units (e.g., Uneekor Eye Mini), repair or replacement of projectors, monitors, and computers, wall and flooring repairs, hitting mat replacement, furniture replacement, and professional cleaning services.

5.4. Broken or unsafe conditions, including torn simulator screens, holes in walls, or damaged furniture, must be reported immediately to GolfLabs. Bays deemed unsafe must not be used until cleared by staff. Failure to report known damage or unsafe conditions may result in liability for additional damages or injuries that occur.

6. SIMULATOR USE RULES

6.1. All golf shots must be directed solely at designated simulator impact screens. Shots directed at monitors, televisions, walls, or any areas not designed to receive impact are strictly prohibited.

6.2. Reckless actions, jumping on furniture, or any unsafe conduct resulting in injury or property damage shall be my sole responsibility.

7. PROHIBITED ACTIVITIES

7.1. Bring-your-own-beverage (BYOB) alcohol consumption is permitted for guests aged 21 and older, in moderation only. GolfLabs does not sell, serve, or provide alcohol. I acknowledge and agree that GolfLabs shall not be held liable for any injuries, incidents, or damages arising from the consumption of alcohol on the premises. Intoxicated or disruptive behavior is grounds for immediate removal.

7.2. Smoking, vaping, open flames, and the use of drugs (medicinal or recreational) that may impair judgment or reaction times are strictly prohibited at the facility.

7.3. Violation of these policies may result in fines, immediate removal, or permanent banning from the facility, at the sole discretion of GolfLabs.

8. MEDICAL AUTHORIZATION

8.1. I understand that the GolfLabs facility is self-service and generally unstaffed. No supervision or emergency personnel are on-site. In case of injury, fire, or medical emergency, I agree to call 911 immediately.

8.2. In the event that GolfLabs staff are present, I authorize them to obtain or arrange for medical treatment deemed necessary in the event of injury or illness while on the premises, including contacting emergency services.

8.3. I accept full financial responsibility for any medical expenses incurred as a result of injury or illness sustained while on the premises.

9. MEDIA CONSENT

9.1. The GolfLabs facility is equipped with 24/7 video surveillance cameras for safety and security purposes.

9.2. I consent to GolfLabs capturing and using photographs, video, or recordings of me while at the facility for security, promotional, or marketing purposes without additional compensation.

9.3. I understand that personal recording for non-commercial use is permitted, but recording of other patrons without their consent, disruption of play, or commercial use of recordings without written consent from GolfLabs is prohibited.

10. LIMITATION OF LIABILITY

Notwithstanding anything to the contrary in this Waiver, the Releasees' total liability shall be limited to the amounts paid by me for the specific booking or use of the Facilities and Equipment giving rise to the claim. The Releasees shall not under any circumstances be liable for punitive, exemplary, aggravated, indirect, or consequential damages.

11. GOVERNING LAW AND DISPUTE RESOLUTION

11.1. This Waiver shall be governed by and construed in accordance with the laws of the State of New Jersey, without regard to its conflict-of-laws principles. Any disputes shall be subject to the exclusive jurisdiction of the courts located in the State of New Jersey.

11.2. Any disputes arising from or related to this Waiver shall first be submitted to good-faith mediation before legal proceedings may be pursued.

11.3. If any provision of this Waiver is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.

12. ACKNOWLEDGMENT

BY ACCEPTING THIS WAIVER, I ACKNOWLEDGE THAT I HAVE CAREFULLY READ THIS RELEASE AND WAIVER OF LIABILITY AND FULLY UNDERSTAND ITS CONTENTS. I AM AWARE THAT THIS IS A RELEASE OF LIABILITY AND A CONTRACT BETWEEN MYSELF AND GOLFLABS, AND I AGREE TO ITS TERMS OF MY OWN FREE WILL.

I HEREBY WAIVE ANY AND ALL LEGAL RIGHTS WHICH I OR MY HEIRS, NEXT OF KIN, EXECUTORS, ADMINISTRATORS, SUCCESSORS, ASSIGNS, OR REPRESENTATIVES MAY HAVE AGAINST THE RELEASEES. I FURTHER AGREE TO INDEMNIFY THE RELEASEES IN ALL RESPECTS REGARDING MY USE OF THE FACILITIES AND EQUIPMENT.

My acceptance during the booking process shall constitute my consent and agreement with the terms set out above.`,
};
function hashContent(content) {
    return (0, crypto_1.createHash)('sha256').update(content, 'utf8').digest('hex');
}
class DocumentService {
    getActiveDocuments(locationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data, error } = yield database_1.supabase
                .from('location_documents')
                .select('id, location_id, document_type, version, title, content, content_hash, is_active, published_by, created_at')
                .eq('location_id', locationId)
                .eq('is_active', true)
                .limit(10);
            if (error) {
                logger_1.logger.error({ err: error, locationId }, 'Error fetching active documents');
                throw new Error('Failed to fetch active documents');
            }
            if (!data || data.length === 0) {
                return null;
            }
            const customDocs = new Map();
            for (const row of data) {
                customDocs.set(row.document_type, row);
            }
            // All 3 document types must exist
            for (const docType of document_types_1.VALID_DOCUMENT_TYPES) {
                if (!customDocs.has(docType)) {
                    logger_1.logger.warn({ locationId, missingType: docType }, 'Location is missing a required document type');
                    return null;
                }
            }
            const result = {};
            for (const docType of document_types_1.VALID_DOCUMENT_TYPES) {
                const doc = customDocs.get(docType);
                result[docType] = {
                    title: doc.title,
                    content: doc.content,
                    contentHash: doc.content_hash,
                    version: doc.version,
                    isDefault: false,
                };
            }
            return result;
        });
    }
    getDocumentHistory(locationId, documentType) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!document_types_1.VALID_DOCUMENT_TYPES.includes(documentType)) {
                throw new Error(`Invalid document type: ${documentType}`);
            }
            const { data, error } = yield database_1.supabase
                .from('location_documents')
                .select('*')
                .eq('location_id', locationId)
                .eq('document_type', documentType)
                .order('version', { ascending: false });
            if (error) {
                logger_1.logger.error({ err: error, locationId, documentType }, 'Error fetching document history');
                throw new Error('Failed to fetch document history');
            }
            return (data || []);
        });
    }
    publishDocument(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { locationId, documentType, title, content, publishedBy } = params;
            if (!document_types_1.VALID_DOCUMENT_TYPES.includes(documentType)) {
                throw new Error(`Invalid document type: ${documentType}`);
            }
            if (content.length < 100) {
                throw new Error('Document content must be at least 100 characters');
            }
            const { data, error } = yield database_1.supabase
                .from('location_documents')
                .insert({
                location_id: locationId,
                document_type: documentType,
                title,
                content,
                published_by: publishedBy,
            })
                .select()
                .single();
            if (error) {
                logger_1.logger.error({ err: error, locationId, documentType }, 'Error publishing document');
                throw new Error('Failed to publish document');
            }
            logger_1.logger.info({ locationId, documentType, version: data.version, publishedBy }, 'Document published');
            return data;
        });
    }
}
exports.DocumentService = DocumentService;
exports.documentService = new DocumentService();
