import { Component } from "react";
import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error("[ErrorBoundary]", error, info?.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 2, p: 4, textAlign: "center" }}>
                    <ErrorOutlineIcon sx={{ fontSize: 56, color: "error.main", opacity: 0.7 }} />
                    <Typography variant="h6">Something went wrong</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
                        {this.state.error?.message || "An unexpected error occurred."}
                    </Typography>
                    <Button variant="contained" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
                        Reload page
                    </Button>
                </Box>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
