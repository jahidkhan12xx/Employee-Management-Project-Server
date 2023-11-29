const express = require('express')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000;


app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f3op28d.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("PB").collection("user");
    const servicesCollection = client.db("PB").collection("Services");
    const reviewsCollection = client.db("PB").collection("testimonial");
    const paymentCollection = client.db("PB").collection("Payment");
    const workSheetCollection = client.db("PB").collection("WorkSheet");

    // jwt related api


    
     app.post("/api/v1/jwt", async (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    const verifyToken = (req, res, next) => {
      console.log("token verifieying");
     
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }
    const verifyHR = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isHR = user?.role === 'hr';
      if (!isHR) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    // service related api's
    app.get("/api/v1/services",async(req,res)=>{
        const result = await servicesCollection.find().toArray();
        res.send(result)
    })

    // testimonial related api's

    app.get("/api/v1/testimonial", async(req,res)=>{
        const result = await reviewsCollection.find().toArray();
        res.send(result);
    })

    // user related api's

    app.get("/api/v1/users",verifyToken, async(req,res)=>{
      console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get("/api/v1/specificUser/:id" , async(req,res)=>{
      const email = req.params.id;
      const query = { email : email};
      const result = await userCollection.findOne(query);
      res.send(result)
    })

    app.patch("/api/v1/users/:id",verifyToken,verifyHR, async(req,res)=>{
      const id = req.params.id;
      const data = req.body;
     
      const filter = { _id: new ObjectId(id) };
      const updatedUSer = {
        $set: {
          isVerified: data.isVerified,
          
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedUSer,
      );
      res.send(result);
    })

    app.get("/api/v1/users/employee",verifyToken, async(req,res)=>{
      const query = { role : "employee"};
      const result = await userCollection.find(query).toArray();
      res.send(result)
    })


    app.get('/api/v1/users/hr/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let hr = false;
      if (user) {
        hr = user?.role === 'hr';
      }
      res.send({ hr });
    })
    app.get('/api/v1/users/admin/:email', async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.post("/api/v1/users", async(req,res)=>{
        const user = req.body;
        const result = await userCollection.insertOne(user);
        res.send(result);
    })



    // payment related api's

    app.post("/api/v1/payment",async(req,res)=>{
      const user = req.body;
      const result = await paymentCollection.insertOne(user);
      res.send(result)
    })


    app.get("/api/v1/payment",verifyToken,verifyHR, async(req,res)=>{
      const result = await paymentCollection.find().toArray();
      res.send(result)
    })

    app.get("/api/v1/userPayment/:id",verifyToken,verifyHR, async(req,res)=>{
      const email = req.params.id;
      const query ={ email : email};
      console.log(query);
      const result = await paymentCollection.findOne(query);
      
      res.send(result);
    })
    app.get("/api/v1/userPay/:id",verifyToken,verifyHR, async (req, res) => {
      const email = req.params.id;
      const query = { email: email };
    
      const result = await paymentCollection.aggregate([
        { $match: query },
        { $unwind: "$payment_history" }, 
        { $sort: { "payment_history.month": -1 } }, 
        {
          $group: {
            _id: "$_id",
            email: { $first: "$email" },
            payment_history: { $push: "$payment_history" },
          },
        },
      ]).toArray();
    
      res.send(result);
    });
    

    

    app.patch("/api/v1/payment/:email",verifyToken,verifyHR, async(req,res)=>{
      const email = req.params.email;
      const newMonth = req.body.month;
      const newAmount = req.body.amount;
      const timestamp = Date.now();
      const transactionId = `TXN_${timestamp}`;

      
      console.log("email", email,newAmount,newMonth);
      const filter = { email: email };
      const existingUser = await paymentCollection.findOne(filter);
      if (existingUser) {
        
        const monthExists = existingUser.payment_history.some(
          (entry) => entry.month === newMonth
        );
    
        if (!monthExists) {
          const updatedUser = {
            $push: {
              payment_history: {
                $each: [
                  { month: newMonth, amount: newAmount, transactionId: transactionId },
                ],
                $sort: { month: 1 },
              },
            },
          };
    
          try {
            const result = await paymentCollection.updateOne(filter, updatedUser);
            res.send(result);
          } catch (error) {
            console.error("Error updating user:", error);
            res.status(500).send("Internal Server Error");
          }
        }
        else {
          res.status(200).json({ modified: false });
        }
      } else {
        res.status(404).send("User not found");
      }
    })


    // Work sheet related

    app.post("/api/v1/workSheet", async(req,res)=>{
      const data = req.body;
      const result = await workSheetCollection.insertOne(data);
      console.log(result);
      res.send(result)
    })

    app.get("/api/v1/workSheet",async(req,res)=>{
      const result = await workSheetCollection.find().toArray();
      res.send(result);
    })

    app.get("/api/v1/progress", async (req, res) => {
      const name = req.query.name;
      const month = req.query.month;
      console.log(name,month);
    
      let query = {};
    
      if (name) {
        query.name = name;
      }
    
      if (month) {
        query.date = {
          $regex: new RegExp(`^2023-${month.padStart(2, '0')}`),
        };
      }
    
      const result = await workSheetCollection.find(query).toArray();
    
      res.send(result);
    });
    

    app.get("/api/v1/userSheet/:email", async(req,res)=>{
      const email = req.params.email;

      const query = {email :email};

      const result = await workSheetCollection.find(query).sort({ date: -1 }).toArray();
      res.send(result)
    })



    // Admin routes

    // Update user Roles

    app.patch("/api/v1/updateRole/:email",verifyToken,verifyAdmin, async(req,res)=>{
      const email = req.params.email;
      const filter = { email: email };
      console.log(email);
      const updatedUSer = {
        $set: {
          role: "hr",
          
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedUSer,
      );
      res.send(result);

    })
    app.patch("/api/v1/fireEmployee/:email",verifyToken,verifyAdmin, async(req,res)=>{
      const email = req.params.email;
      const filter = { email: email };
      console.log(email);
      const options = { upsert: true };
      const updatedUSer = {
        $set: {
          isFired: true,
          
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedUSer,
        options
      );
      res.send(result);

    })

    app.get("/api/v1/checkingUser/:email", async(req,res)=>{

      const email = req.params.email;
      const query = {email :email};
      const user = await userCollection.findOne(query)
      let isFired = false;
      if(user){
        isFired = user?.isFired;
      }

      res.send({isFired})
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})