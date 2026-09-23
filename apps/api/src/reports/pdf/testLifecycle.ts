import { after } from "node:test";
import { closePdfEngine } from "./htmlToPdf.js";
after(closePdfEngine);
