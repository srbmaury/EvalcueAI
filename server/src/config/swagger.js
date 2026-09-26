import swaggerJSDoc from "swagger-jsdoc";

const definition = {
    openapi: "3.0.0",
    info: {
        title: "EvalcueAI API",
        version: "1.0.0",
        description: "API documentation for EvalcueAI backend",
    },
    servers: [
        { url: "/" },
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: "apiKey",
                in: "cookie",
                name: "jwt",
            },
        },
        schemas: {
            RegisterRequest: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                    name: { type: "string", example: "Saurabh" },
                    email: { type: "string", format: "email", example: "saurabh@example.com" },
                    password: { type: "string", format: "password", example: "password123" },
                },
            },
            LoginRequest: {
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: { type: "string", format: "email", example: "saurabh@example.com" },
                    password: { type: "string", format: "password", example: "password123" },
                },
            },
            CreateRoundRequest: {
                type: "object",
                required: ["roundName", "description"],
                properties: {
                    roundName: { type: "string", example: "Technical Interview Round 1" },
                    description: { type: "string", example: "Focus on DSA and problem-solving skills." },
                    deliveryMode: { type: "string", enum: ["online-assessment", "conversational"], example: "conversational" },
                },
            },
            SuggestRoundsRequest: {
                type: "object",
                required: ["company", "jobRole", "jobDescription"],
                properties: {
                    company: { type: "string", example: "Google" },
                    jobRole: { type: "string", example: "SDE I" },
                    jobDescription: { type: "string", example: "We are hiring software engineers with strong DSA and system design skills." },
                },
            },
            CreateInterviewRequest: {
                type: "object",
                required: ["resumeId", "company", "jobRole", "jobDescription", "rounds"],
                properties: {
                    resumeId: { type: "string", example: "RESUME_ID_HERE" },
                    company: { type: "string", example: "Google" },
                    jobRole: { type: "string", example: "SDE 1" },
                    jobDescription: { type: "string", example: "We are hiring engineers with strong problem-solving skills." },
                    rounds: {
                        type: "array",
                        items: { type: "object", properties: { round: { type: "string", example: "ROUND_ID_HERE" } } },
                        example: [{ round: "ROUND_ID_HERE" }],
                    },
                },
            },
            CreateInterviewBulkRequest: {
                type: "object",
                required: ["resumeId", "company", "jobRole", "jobDescription", "rounds"],
                properties: {
                    resumeId: { type: "string", example: "RESUME_ID_HERE" },
                    company: { type: "string", example: "Salesforce" },
                    jobRole: { type: "string", example: "AMTS" },
                    jobDescription: { type: "string", example: "Responsible for assisting in technical tasks and development." },
                    rounds: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                roundName: { type: "string" },
                                description: { type: "string" },
                                deliveryMode: { type: "string", enum: ["online-assessment", "conversational"] },
                            },
                        },
                        example: [
                            { roundName: "Technical Round 1", description: "Data Structures and Algorithms", deliveryMode: "online-assessment" },
                            { roundName: "HR Round", description: "Soft skills and culture fit", deliveryMode: "conversational" },
                        ],
                    },
                },
            },
            PrepareQuestionsRequest: {
                type: "object",
                properties: {
                    count: { type: "integer", minimum: 1, maximum: 20, example: 10 },
                },
            },
            ConversationalAnswerRequest: {
                type: "object",
                required: ["index"],
                properties: {
                    index: { type: "integer", minimum: 0, example: 0 },
                    answer: { type: "string", example: "Here is my answer." },
                },
            },
            OaAnswersRequest: {
                type: "object",
                required: ["answers"],
                properties: {
                    answers: { type: "array", items: { type: "string" }, example: ["A1", "A2", "A3"] },
                },
            },
            AttachFeedbackRequest: {
                type: "object",
                required: ["index", "feedbackId"],
                properties: {
                    index: { type: "integer", example: 0 },
                    feedbackId: { type: "string", example: "FEEDBACK_ID_HERE" },
                },
            },
            RunCodeRequest: {
                type: "object",
                properties: {
                    language: { type: "string", example: "python" },
                    code: { type: "string", example: "print('hello')" },
                    stdin: { type: "string", example: "" },
                },
            },
            ResumeReviewRequest: {
                type: "object",
                properties: {
                    role: { type: "string", example: "Backend Engineer" },
                    jobDescription: { type: "string", example: "We are hiring a backend engineer with Node.js and MongoDB experience." },
                },
            },
            ResumeReviewResponse: {
                type: "object",
                properties: {
                    summary: { type: "string", example: "Strong backend experience; highlight cloud deployments." },
                    atsScore: { type: "integer", minimum: 0, maximum: 100, example: 78 },
                    strengths: { type: "array", items: { type: "string" }, example: ["Node.js", "System design"] },
                    gaps: { type: "array", items: { type: "string" }, example: ["Kubernetes", "CI/CD"] },
                    keywordsMatched: { type: "array", items: { type: "string" }, example: ["Node.js", "MongoDB", "REST"] },
                    improvementSuggestions: { type: "array", items: { type: "string" }, example: ["Quantify impact", "Add Kubernetes experience"] },
                    roleAlignment: { type: "string", example: "Good alignment to Backend Engineer; bolster cloud skills." },
                },
            },
        },
        responses: {
            UnauthorizedError: {
                description: "Not authorized",
            },
        },
    },
    security: [{ cookieAuth: [] }],
};

const options = {
    definition,
    apis: [
        "./src/routes/*.js",
        "./src/controllers/*.js",
        "./src/models/*.js",
    ],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
