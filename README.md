# Job Lens AI

Build a fully functional one-page web application called “JobLens AI”.

JobLens AI is an AI-powered job application assistant designed primarily for university students, recent graduates, internship applicants, and entry-level job seekers from all industries.

The application must allow a user to paste their CV and a job description, then receive an honest and explainable analysis of their suitability for the role.

Use Lovable Cloud and Lovable AI for the analysis. Do not require the user to provide an external API key. Do not add authentication, a database, payments, application history, PDF upload, or external integrations.

IMPORTANT PRODUCT RULE:

The AI must never invent or assume experience, education, skills, certifications, achievements, or personal information that is not clearly supported by the CV. It must never encourage the user to lie or add false information.

Create a modern, responsive, professional single-page interface.

BRANDING

Product name:

JobLens AI

Tagline:

Know your fit. Improve your application.

Add a small subtitle:

Honest, explainable application feedback for students and recent graduates.

DESIGN

Use:

- A deep navy page background

- White or slightly off-white content cards

- Blue and violet accent colours

- Rounded corners

- Subtle shadows

- Spacious layout

- Clear modern typography

- Professional career-focused styling

- Responsive desktop and mobile design

Do not make it look like a complex corporate dashboard.

Do not use unnecessary animations.

Do not use stock photographs.

INPUT FORM

Create a large input card with:

1. Job Title

- Single-line text input

- Required

2. Company Name

- Single-line text input

- Optional

3. CV

- Large text area

- Required

- Placeholder explaining that the user should paste the text of their CV

4. Job Description

- Large text area

- Required

- Placeholder explaining that the user should paste the complete job or internship description

5. Output Language

- Selector with:

  - English

  - Turkish

6. Primary button:

Analyse My Application

Add a short privacy note below the form:

Your CV is used only to generate this analysis. Avoid including unnecessary sensitive personal information.

VALIDATION

Before starting the analysis:

- Require the job title

- Require the CV

- Require the job description

- Reject a CV shorter than 150 characters

- Reject a job description shorter than 150 characters

- Show clear, friendly validation messages

- Never expose technical error details to the user

LOADING STATE

While the analysis is running:

- Disable the Analyse My Application button

- Show a loading indicator

- Display:

  “Reviewing your experience and the job requirements...”

AI ANALYSIS

Use Lovable AI to compare the CV only against requirements actually found in the job description.

The response must follow a reliable structured format so that every result can be displayed in its own card.

Generate these fields:

1. verdict

Allowed values:

- Strong Fit

- Worth Applying

- Stretch Opportunity

- Low Fit

2. verdictExplanation

A concise explanation of the verdict.

3. matchScore

An integer from 0 to 100.

The score should consider:

- Required skills

- Relevant experience

- Education requirements

- Tools and technologies

- Responsibilities

- Languages

- Location requirements

- Work authorisation

- Certifications

- Mandatory eligibility requirements

The score is an explainable estimate, not an official ATS score or a guarantee of employment.

4. strongMatches

A list of objects containing:

- requirement

- cvEvidence

- explanation

Only include a strong match when the CV contains clear supporting evidence.

5. learnableGaps

A list of objects containing:

- skill

- importance

- suggestion

These should be skills that are absent or underdeveloped but could reasonably be learned or improved.

6. possibleBlockers

A list of objects containing:

- requirement

- reason

- severity

Allowed severity values:

- Low

- Medium

- High

Only include genuine blockers clearly stated in the job description, such as:

- Mandatory work authorisation

- Required location

- Mandatory degree

- Mandatory certification

- Required language level

- Minimum years of experience

If there are no clear blockers, return an empty list.

7. cvSuggestions

A list of objects containing:

- section

- suggestion

- reason

- example

Suggestions must improve the presentation of information already supported by the CV.

Never fabricate numbers or achievements.

When suggesting measurable results, tell the user to add them only if they are accurate and verifiable.

8. recruiterMessage

Generate a natural and personalised message for a recruiter or relevant company employee.

The message must:

- Mention the job title

- Mention the company when a company name is supplied

- Use only facts supported by the CV

- Be professional but not robotic

- Avoid exaggerated praise

- Be no longer than 500 characters

- Be written in the selected output language

9. disclaimer

Include a short statement explaining that the result is an AI-generated estimate and not an official ATS assessment or hiring decision.

OUTPUT LANGUAGE

All generated analysis content must be written in the language selected by the user.

Keep the interface labels in English for the first version, but generate the complete analysis and recruiter message in English or Turkish according to the selector.

RESULTS INTERFACE

After a successful analysis, display:

1. A prominent verdict and score card

- Show the verdict

- Show the score as “X / 100”

- Include a circular or horizontal score visual

- Display the verdict explanation

- Clearly label the score as an estimated match score

2. Strong Matches card

- Display every requirement with its CV evidence

- Use positive but professional styling

3. Learnable Gaps card

- Explain why each gap matters

- Show a realistic improvement suggestion

4. Possible Blockers card

- Show the severity of every blocker

- If there are no blockers, show:

  “No clear mandatory blockers were identified.”

5. CV Improvement Suggestions card

- Show the relevant CV section

- Show the suggestion and reason

- Show an example rewrite only when it can be created without inventing information

6. Recruiter Message card

- Display the generated message

- Include a working Copy Message button

- Show brief confirmation after the message is copied

Add a button at the bottom:

Analyse Another Application

This button should clear the analysis results and return the user to the form.

ERROR HANDLING

If the AI request fails or the response cannot be displayed:

- Keep the user’s entered form content

- Show a friendly message:

  “We couldn’t complete the analysis. Please try again.”

- Add a Try Again button

- Do not show stack traces, raw JSON, API information, or technical error messages

ACCESSIBILITY

- Use proper labels for every form field

- Ensure keyboard navigation works

- Use readable contrast

- Add visible focus states

- Do not rely only on colour to communicate verdicts or severity

Build the complete working MVP now, including the responsive interface, validation, Lovable AI analysis, structured results, error handling, and copy functionality.

Do not add features outside this scope.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://joblens-ai-fit-finder.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ae93b89b-177b-4f10-af9d-dc9d2ae48c80).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
