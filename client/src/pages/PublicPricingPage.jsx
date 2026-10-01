import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Container, Grid, Link, Paper, Stack, Typography } from "@mui/material";
import servicePricing from "../../../shared/servicePricing.json";
import api from "../api/axios";
import PublicSiteFrame from "../components/PublicSiteFrame";
import SiteFooter from "../components/SiteFooter";
import Seo from "../components/Seo";
import { publicSalesEmail } from "../utils/publicContact";

export default function PublicPricingPage() {
    const [prices, setPrices] = useState({});
    useEffect(() => { let active = true; api.get("/billing/catalog").then(({data}) => { if (active) setPrices(data.prices || {}); }).catch(() => {}); return () => { active = false; }; }, []);
    return <PublicSiteFrame><Seo title="Pricing | EvalcueAI Practice and Hire" description="Practice Pro ₹699 per month. Hire Pilot ₹2,999 one-time, Starter ₹9,999 per month, and Growth ₹29,999 per month. Prices in INR." canonicalPath="/plans" />
        <Container maxWidth="lg" sx={{ py: {xs:6,md:10} }}>
            <Typography variant="overline">Plans and pricing</Typography><Typography component="h1" mt={1}>Choose the capacity you need.</Typography>
            <Typography color="text.secondary" mt={2} maxWidth={650}>Personal interview practice and organization hiring plans are billed separately. All prices below are in Indian rupees.</Typography>
            <Paper variant="outlined" sx={{p:3,my:4}}><Stack direction={{xs:"column",sm:"row"}} justifyContent="space-between" gap={2}><Box><Typography component="h2" variant="h6">Practice Free · ₹0</Typography><Typography color="text.secondary" mt={1}>3 interviews, 10 resume reviews, and 10 tailored resume generations each month. No card required.</Typography></Box><Button component={RouterLink} to="/practice/register" variant="outlined">Start free practice</Button></Stack></Paper>
            <Grid container spacing={3}>{servicePricing.map(plan => { const configured = prices[plan.product]?.[plan.plan]; const price = configured || plan; const amount = new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(price.unitAmount/100);
                return <Grid key={plan.plan} size={{xs:12,sm:6,lg:3}}><Paper variant="outlined" sx={{p:3,height:"100%",display:"flex",flexDirection:"column"}}><Typography component="h2" variant="h6">{plan.name}</Typography><Typography fontSize="1.9rem" fontWeight={650} mt={2}>{amount}</Typography><Typography color="text.secondary">{plan.type === "one_time" ? "One-time payment" : "Per month"}</Typography><Box component="ul" sx={{pl:2.25,my:3,color:"text.secondary","& li":{mb:1}}}>{plan.features.map(feature=><li key={feature}>{feature}</li>)}</Box><Button component={RouterLink} to={plan.path} variant="outlined" sx={{mt:"auto"}}>View {plan.name}</Button></Paper></Grid>;
            })}</Grid>
            <Typography color="text.secondary" mt={4}>Monthly plans renew automatically after you authorize a payment mandate. You can stop renewal from billing management. The Pilot is a single payment and does not renew. The final payable amount and any applicable taxes are shown before you authorize payment.</Typography>
            <Typography color="text.secondary" mt={2}>For custom enterprise capacity, <Link href={`mailto:${publicSalesEmail}`}>contact sales</Link>. See our <Link component={RouterLink} to="/terms">terms of use</Link> for billing and refund details.</Typography>
        </Container><SiteFooter />
    </PublicSiteFrame>;
}
